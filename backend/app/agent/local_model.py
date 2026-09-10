"""Offline, deterministic Strands model provider.

CivicFlow's primary model is Amazon Bedrock. Judges and contributors without AWS credentials
still need the full agent loop to run, so this provider implements the Strands `Model`
interface with a rules-based policy: it reads the conversation so far (which tools have been
called and what they returned) and emits the next tool call in the community-request
workflow. The Strands event loop, tool execution, approval gating, event logging and UI are
identical to the Bedrock path — only the "brain" is swapped.
"""

from __future__ import annotations

import json
import re
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from strands.models.model import Model

from app.domain import DEFAULT_SETTINGS

CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "safety": (
        "unsafe",
        "danger",
        "injur",
        "fire",
        "exposed wire",
        "gas",
        "flood",
        "collapse",
        "hazard",
        "smoke",
    ),
    "it_support": (
        "computer",
        "laptop",
        "wifi",
        "wi-fi",
        "internet",
        "printer",
        "software",
        "login",
        "password",
        "network",
        "digital",
        "projector",
    ),
    "maintenance": (
        "broken",
        "leak",
        "repair",
        "not working",
        "stopped working",
        "light",
        "roof",
        "door",
        "toilet",
        "plumb",
        "electric",
        "pothole",
        "fence",
        "paint",
        "water",
    ),
    "event": (
        "event",
        "ceremony",
        "festival",
        "meeting",
        "workshop",
        "book the hall",
        "venue",
        "celebration",
        "fair",
        "gathering",
        "tournament",
    ),
    "volunteer": ("volunteer", "help out", "sign up", "mentor", "tutor", "join"),
    "donation": ("donat", "donor", "contribute", "sponsor", "gift", "fundrais", "in-kind", "books to give"),
    "library": (
        "library",
        "book",
        "borrow",
        "reading",
        "catalogue",
        "catalog",
        "membership card",
        "overdue book",
    ),
    "complaint": ("complain", "unhappy", "rude", "disappointed", "unacceptable", "noise", "dissatisf"),
    "question": ("how do i", "what are", "when is", "opening hours", "can you tell", "?", "where can"),
}

CATEGORY_LABEL = {
    "maintenance": "the request describes damaged or non-functioning infrastructure",
    "it_support": "the request concerns computers, connectivity or digital systems",
    "event": "the request asks to organise or host an activity",
    "volunteer": "the requester is offering or asking for volunteer help",
    "donation": "the request concerns giving or coordinating donations",
    "library": "the request concerns library services or materials",
    "complaint": "the requester expresses dissatisfaction with a service",
    "question": "the requester is asking for information",
    "safety": "the request describes a hazard to people",
    "other": "the request does not match a documented category",
}

URGENT_WORDS = ("emergency", "danger", "injur", "unsafe", "flood", "fire", "exposed wir")
HIGH_WORDS = (
    "urgent",
    "immediately",
    "asap",
    "right now",
    "cannot",
    "can't",
    "stopped working",
    "not working",
    "no access",
    "blocked",
    "broken",
    "outage",
)
LOW_WORDS = ("whenever", "no rush", "sometime", "suggestion", "would be nice", "question", "wondering")


class LocalPolicyModel(Model):
    """Rules-based Strands model used when Bedrock credentials are unavailable."""

    def __init__(self, **config: Any) -> None:
        self._config = {"model_id": "civicflow-local-policy", **config}

    def update_config(self, **model_config: Any) -> None:
        self._config.update(model_config)

    def get_config(self) -> dict:
        return self._config

    async def structured_output(self, output_model, prompt, system_prompt=None, **kwargs):
        raise NotImplementedError("LocalPolicyModel does not support structured output")
        yield  # pragma: no cover

    # ------------------------------------------------------------------ Strands interface
    async def stream(
        self, messages, tool_specs=None, system_prompt=None, **kwargs
    ) -> AsyncGenerator[dict, None]:
        state = _ConversationState(messages)
        step = self._next_step(state)
        yield {"messageStart": {"role": "assistant"}}
        if step is None:
            text = self._final_text(state)
            yield {"contentBlockDelta": {"delta": {"text": text}}}
            yield {"contentBlockStop": {}}
            yield {"messageStop": {"stopReason": "end_turn"}}
            return
        name, args = step
        yield {
            "contentBlockStart": {
                "start": {"toolUse": {"toolUseId": f"local-{uuid.uuid4().hex[:8]}", "name": name}}
            }
        }
        yield {"contentBlockDelta": {"delta": {"toolUse": {"input": json.dumps(args)}}}}
        yield {"contentBlockStop": {}}
        yield {"messageStop": {"stopReason": "tool_use"}}

    # ------------------------------------------------------------------ policy
    def _next_step(self, s: _ConversationState) -> tuple[str, dict] | None:
        if s.mode == "monitor":
            return self._monitor_step(s)
        if s.mode == "report":
            if not s.called("generate_report"):
                return "generate_report", {"period_days": s.payload.get("period_days", 7)}
            return None
        return self._intake_step(s)

    def _intake_step(self, s: _ConversationState) -> tuple[str, dict] | None:
        req = s.payload
        text = f"{req.get('title', '')}. {req.get('description', '')}"
        low = text.lower()

        if not s.called("search_community_knowledge"):
            return "search_community_knowledge", {"query": req.get("title") or text[:120]}

        category, cat_conf = _classify(low)
        if not s.called("classify_request"):
            return "classify_request", {
                "category": category,
                "confidence": cat_conf,
                "reason": f"Classified as {category.replace('_', ' ')} because {CATEGORY_LABEL[category]}.",
            }

        if not s.called("set_priority"):
            priority, conf, why = _prioritize(low, category)
            return "set_priority", {"priority": priority, "confidence": conf, "reason": why}

        if not s.called("extract_details"):
            return "extract_details", _extract(req, text)

        if not s.called("assign_request") or s.last_error("assign_request"):
            team = _pick_team(s.knowledge.get("directory", []), category, low)
            if team is None or s.count("assign_request") >= 2:
                if not s.called("record_decision"):
                    return "record_decision", {
                        "summary": "I don't have enough information to safely assign this request: the directory "
                        "has no team responsible for this category. Leaving it for a coordinator."
                    }
                return None
            return "assign_request", {
                "team": team["name"],
                "reason": f"Assigned to {team['name']} because the organization directory maps "
                f"{category.replace('_', ' ')} requests to that team.",
            }

        team_name = s.result("assign_request").get("team")
        if not s.called("create_task"):
            details = _task_details(req, s.result("extract_details"))
            return "create_task", {"title": _task_title(category, req), "details": details, "team": team_name}

        if not s.called("draft_response"):
            return "draft_response", {"message": _reply(req, category, s)}

        settings = s.settings
        if settings["autonomy"].get("auto_send_requester_updates", True) and not s.called(
            "send_notification"
        ):
            return "send_notification", {
                "recipient": req.get("requester_contact") or req.get("requester_name") or "requester",
                "subject": f"We received your request: {req.get('title', '')[:60]}",
                "body": s.result("draft_response").get("preview") or _reply(req, category, s),
                "channel": "email" if "@" in (req.get("requester_contact") or "") else "internal",
            }

        if s.count("send_notification") < 2 and team_name:
            contact = s.result("assign_request").get("contact") or team_name
            task = s.result("create_task")
            return "send_notification", {
                "recipient": contact,
                "subject": f"New {s.result('set_priority').get('priority', '')} priority task: {task.get('title', '')}",
                "body": f"A new request has been assigned to {team_name}. Task #{task.get('task_id')} is due "
                f"{task.get('due_at', '')[:16]}. Summary: {s.result('extract_details').get('summary', '')}",
                "channel": "internal",
            }

        if not s.called("schedule_followup"):
            priority = s.result("set_priority").get("priority", "medium")
            hours = settings["followup"]["check_after_hours"].get(priority, 24)
            return "schedule_followup", {
                "hours_from_now": hours,
                "note": f"Check whether {team_name} has updated the task; escalate if no progress.",
            }

        if not s.called("record_decision"):
            priority = s.result("set_priority").get("priority", "medium")
            policy = (
                "grounded in the knowledge base"
                if s.knowledge.get("policy_found")
                else "with no documented policy found"
            )
            return "record_decision", {
                "summary": f"Routed as {priority} priority {category.replace('_', ' ')} to {team_name} {policy}; "
                f"requester acknowledged and a follow-up check is scheduled."
            }
        return None

    def _monitor_step(self, s: _ConversationState) -> tuple[str, dict] | None:
        if not s.called("get_task_status"):
            return "get_task_status", {}
        status = s.result("get_task_status")
        stalled = [
            t
            for t in status.get("tasks", [])
            if t["status"] != "done" and (t["overdue"] or t["hours_since_update"] >= 1)
        ]
        needs_escalation = (status.get("request_overdue") or stalled) and not status.get("already_escalated")
        if needs_escalation and not s.called("escalate_request"):
            titles = ", ".join(t["title"] for t in stalled) or "the assigned work"
            return "escalate_request", {
                "escalate_to": s.settings["followup"].get("escalate_to", "Operations Director"),
                "reason": f"No progress recorded on {titles} and the {status.get('priority', '')} priority SLA "
                f"has {'passed' if status.get('request_overdue') else 'no update within the follow-up window'}.",
            }
        if (
            not needs_escalation
            and not s.called("schedule_followup")
            and status.get("request_status") not in ("resolved", "closed")
        ):
            return "schedule_followup", {"hours_from_now": 24, "note": "Routine progress check."}
        if not s.called("record_decision"):
            if needs_escalation:
                summary = (
                    "Follow-up found no progress; recommended escalation and asked a human to approve it."
                )
            else:
                summary = "Follow-up check completed; work is progressing, next check scheduled."
            return "record_decision", {"summary": summary}
        return None

    def _final_text(self, s: _ConversationState) -> str:
        if s.mode == "monitor":
            return s.result("record_decision").get("summary") or "Follow-up check complete."
        if s.mode == "report":
            hl = s.result("generate_report").get("highlights") or []
            return " ".join(hl) or "Report generated."
        return s.result("record_decision").get("summary") or "Request processed."


# ---------------------------------------------------------------------- heuristics
def _classify(low: str) -> tuple[str, float]:
    scores = {c: sum(1 for k in kws if k in low) for c, kws in CATEGORY_KEYWORDS.items()}
    # A hazard beats everything; questions are a weak signal that loses to any concrete topic.
    if scores["safety"]:
        return "safety", 0.9
    if any(v for c, v in scores.items() if c != "question"):
        scores["question"] = 0
    # Intent categories (someone offering/asking something) win ties over topic keywords.
    tie_break = ("donation", "volunteer", "event", "complaint", "library", "it_support", "maintenance")
    best = max(scores, key=lambda c: (scores[c], -tie_break.index(c) if c in tie_break else -99))
    if scores[best] == 0:
        return "other", 0.4
    conf = min(0.95, 0.6 + 0.12 * scores[best])
    return best, round(conf, 2)


def _prioritize(low: str, category: str) -> tuple[str, float, str]:
    if any(w in low for w in URGENT_WORDS) or category == "safety":
        return (
            "urgent",
            0.9,
            "Marked Urgent because the request describes a hazard or demands immediate action.",
        )
    if any(w in low for w in HIGH_WORDS):
        return (
            "high",
            0.82,
            "Marked High Priority because the issue blocks access to an essential service for a group of people.",
        )
    if any(w in low for w in LOW_WORDS) or category in ("question", "donation", "volunteer"):
        return "low", 0.7, "Marked Low Priority because the request is informational or not time-critical."
    return "medium", 0.72, "Marked Medium Priority because the request needs action but nobody is blocked."


def _extract(req: dict, text: str) -> dict:
    low = text.lower()
    out: dict[str, Any] = {"summary": _summary(req)}
    place = r"(?:lab|hall|room|library|kitchen|road|street|block|wing|playground|office|corridor|classroom|toilet|store)"
    loc = re.search(
        rf"\b(?:in|at|on|near) (?:the |our )?((?:[\w'&-]+ ){{0,3}}{place}\b(?: [A-Z]\b)?)", text, re.I
    )
    if not loc:
        loc = re.search(r"\b(?:in|at|on|near) (?:the |our )?([A-Z][\w'&-]*(?: [A-Z][\w'&-]*){0,3})", text)
    if loc:
        out["location"] = loc.group(1).strip()
    people = re.search(
        r"(\d+\s+(?:students|children|people|families|members|residents|volunteers|patients|learners))", low
    )
    if people:
        out["affected_people"] = people.group(1)
    else:
        for group in ("students", "children", "residents", "members", "volunteers", "families"):
            if group in low:
                out["affected_people"] = group
                break
    assets = re.search(
        r"(\d+\s+(?:computers|laptops|desks|chairs|books|tables|lights|taps|toilets|tents))", low
    )
    if assets:
        out["assets"] = assets.group(1)
    elif "computers" in low:
        out["assets"] = "computers"
    when = re.search(
        r"\b(?:on|by|before|this|next)\s+((?:mon|tues|wednes|thurs|fri|satur|sun)day|\d{1,2}(?:st|nd|rd|th)?\s+\w+|\w+ \d{1,2}(?:st|nd|rd|th)?|weekend|week|month)",
        low,
    )
    if when:
        out["deadline"] = when.group(0)
    return out


def _summary(req: dict) -> str:
    desc = (req.get("description") or "").strip()
    greeting = re.compile(r"^(hi|hello|dear|good (morning|afternoon|evening))\b", re.I)
    sentences = [s for s in re.split(r"(?<=[.!?])\s", desc) if s and not greeting.match(s)]
    substantive = [s for s in sentences if len(s) > 25] or sentences
    return (substantive[0] if substantive else req.get("title", ""))[:220]


def _pick_team(directory: list[dict], category: str, low: str) -> dict | None:
    for t in directory:
        if category in (t.get("categories") or []):
            return t
    for t in directory:
        if "other" in (t.get("categories") or []):
            return t
    return None


def _task_title(category: str, req: dict) -> str:
    verbs = {
        "maintenance": "Repair",
        "it_support": "Restore",
        "event": "Coordinate",
        "volunteer": "Onboard",
        "donation": "Coordinate",
        "library": "Handle",
        "complaint": "Review",
        "question": "Answer",
        "safety": "Make safe",
        "other": "Handle",
    }
    return f"{verbs.get(category, 'Handle')}: {req.get('title', 'community request')[:80]}"


def _task_details(req: dict, extracted: dict) -> str:
    facts = extracted.get("extracted") or {}
    lines = [extracted.get("summary") or req.get("description", "")]
    for k, v in facts.items():
        lines.append(f"- {k.replace('_', ' ').title()}: {v}")
    lines.append(
        f"- Requester: {req.get('requester_name', 'Anonymous')} ({req.get('requester_contact') or 'no contact given'})"
    )
    return "\n".join(lines)


def _reply(req: dict, category: str, s: _ConversationState) -> str:
    name = req.get("requester_name") or "there"
    team = s.result("assign_request").get("team", "the responsible team")
    priority = s.result("set_priority").get("priority", "medium")
    sla = s.result("set_priority").get("sla_hours")
    parts = name.split()
    titled = bool(parts) and parts[0].rstrip(".").lower() in ("ms", "mr", "mrs", "dr", "prof")
    first = " ".join(parts[:2]) if titled else (parts[0] if parts else name)
    grounded = s.knowledge.get("results") or []
    policy_line = ""
    if grounded:
        policy_line = f" Relevant guideline: “{grounded[0]['title']}”."
    else:
        policy_line = (
            " We have no documented policy covering this yet, so a coordinator will confirm next steps."
        )
    target = f" We aim to act within {sla} hours for {priority} priority requests." if sla else ""
    return (
        f"Hi {first}, thanks for reaching out about “{req.get('title', '')}”. We've logged it as {'an' if priority == 'urgent' else 'a'} {priority} priority "
        f"{category.replace('_', ' ')} request and assigned it to {team}.{target}{policy_line} "
        f"We'll follow up automatically and let you know when it's resolved."
    )


# ---------------------------------------------------------------------- conversation parsing
class _ConversationState:
    """Reads a Strands message list into 'what has already happened' for the policy."""

    def __init__(self, messages: list[dict]) -> None:
        self.mode = "intake"
        self.payload: dict = {}
        self.settings: dict = DEFAULT_SETTINGS
        self.calls: list[tuple[str, dict]] = []
        self.results: dict[str, dict] = {}
        self.errors: dict[str, str] = {}
        self._counts: dict[str, int] = {}
        pending: dict[str, str] = {}
        for m in messages:
            for block in m.get("content", []):
                if "text" in block and m["role"] == "user":
                    self._parse_prompt(block["text"])
                if "toolUse" in block:
                    tu = block["toolUse"]
                    pending[tu["toolUseId"]] = tu["name"]
                    self.calls.append((tu["name"], tu.get("input") or {}))
                    self._counts[tu["name"]] = self._counts.get(tu["name"], 0) + 1
                if "toolResult" in block:
                    tr = block["toolResult"]
                    name = pending.get(tr["toolUseId"], "")
                    data = _parse_result(tr)
                    if isinstance(data, dict) and "error" in data:
                        self.errors[name] = data["error"]
                    else:
                        self.errors.pop(name, None)
                        self.results[name] = data if isinstance(data, dict) else {"value": data}
        self.knowledge = self.results.get("search_community_knowledge", {})

    def _parse_prompt(self, text: str) -> None:
        m = re.search(r"CIVICFLOW_TASK:\s*(\{.*\})", text, re.S)
        if not m:
            return
        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError:
            return
        self.mode = data.get("mode", "intake")
        self.payload = data.get("request", data)
        self.settings = {**DEFAULT_SETTINGS, **data.get("settings", {})}

    def called(self, name: str) -> bool:
        return name in self.results or name in self.errors

    def count(self, name: str) -> int:
        return self._counts.get(name, 0)

    def result(self, name: str) -> dict:
        return self.results.get(name, {})

    def last_error(self, name: str) -> str | None:
        return self.errors.get(name)


def _parse_result(tr: dict) -> Any:
    for c in tr.get("content", []):
        if "json" in c:
            return c["json"]
        if "text" in c:
            try:
                return json.loads(c["text"])
            except json.JSONDecodeError:
                return {"text": c["text"]}
    return {}
