"""Tools the CivicFlow orchestrator can call.

Every tool performs a real application action against the database, records an
`AgentEvent` (which powers the Agent Activity timeline) and, when the action's risk tier
meets the organization's approval threshold, is converted into a pending `Approval`
instead of being executed.
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func
from strands import tool

from app.agent.context import current, log_event
from app.db.models import Approval, FollowUp, Notification, Request, Task, Team, utcnow
from app.domain import ACTION_RISK, CATEGORIES, PRIORITIES, RISK_ORDER
from app.services import knowledge as kb
from app.services.settings import get_all_settings


# --------------------------------------------------------------------------- helpers
def _request() -> Request:
    ctx = current()
    if ctx.request_id is None:
        raise ValueError("This tool needs an active community request")
    req = ctx.db.get(Request, ctx.request_id)
    if req is None:
        raise ValueError(f"Request {ctx.request_id} not found")
    return req


def _needs_approval(action: str) -> bool:
    threshold = get_all_settings(current().db)["autonomy"]["approval_threshold"]
    return RISK_ORDER[ACTION_RISK[action]] >= RISK_ORDER[threshold]


def _request_approval(action: str, proposed: dict, recommendation: str, reason: str) -> dict:
    ctx = current()
    req = _request()
    existing = (
        ctx.db.query(Approval)
        .filter(Approval.request_id == req.id, Approval.action == action, Approval.status == "pending")
        .first()
    )
    if existing:
        return {"status": "pending_approval", "approval_id": existing.id, "note": "already awaiting a human"}
    approval = Approval(
        request_id=req.id,
        action=action,
        risk=ACTION_RISK[action],
        recommendation=recommendation,
        reason=reason,
        proposed_action=proposed,
    )
    ctx.db.add(approval)
    req.status = "awaiting_approval"
    ctx.db.flush()
    log_event(
        action,
        proposed,
        {"status": "pending_approval", "approval_id": approval.id},
        reason=reason,
        requires_approval=True,
    )
    return {
        "status": "pending_approval",
        "approval_id": approval.id,
        "message": "High-impact action queued for human approval; it will run once approved.",
    }


def _add_reasoning(req: Request, step: str, text: str) -> None:
    req.reasoning = [*(req.reasoning or []), {"step": step, "text": text, "at": utcnow().isoformat()}]


def _sla_hours(priority: str | None) -> int:
    sla = get_all_settings(current().db)["sla_hours"]
    return int(sla.get(priority or "medium", 72))


# --------------------------------------------------------------------------- understanding
@tool
def classify_request(category: str, confidence: float, reason: str) -> dict:
    """Classify the current community request into exactly one category.

    Args:
        category: One of maintenance, it_support, event, volunteer, donation, library, complaint,
            question, safety, other.
        confidence: Your confidence between 0 and 1.
        reason: One short, requester-safe sentence explaining the classification.
    """
    if category not in CATEGORIES:
        return {"error": f"Unknown category '{category}'. Use one of {list(CATEGORIES)}"}
    req = _request()
    req.category = category
    if req.status == "new":
        req.status = "triaged"
    _add_reasoning(req, "classify", reason)
    log_event(
        "classify_request",
        {"category": category},
        {"category": category},
        reason=reason,
        confidence=confidence,
    )
    return {"category": category, "status": req.status}


@tool
def set_priority(priority: str, confidence: float, reason: str) -> dict:
    """Set the priority of the current request and derive its SLA due date.

    Args:
        priority: One of low, medium, high, urgent.
        confidence: Your confidence between 0 and 1.
        reason: One short sentence explaining the priority.
    """
    if priority not in PRIORITIES:
        return {"error": f"Unknown priority '{priority}'. Use one of {list(PRIORITIES)}"}
    req = _request()
    req.priority = priority
    req.due_at = utcnow() + timedelta(hours=_sla_hours(priority))
    _add_reasoning(req, "prioritize", reason)
    log_event(
        "set_priority",
        {"priority": priority},
        {"priority": priority, "due_at": req.due_at.isoformat()},
        reason=reason,
        confidence=confidence,
    )
    return {"priority": priority, "due_at": req.due_at.isoformat(), "sla_hours": _sla_hours(priority)}


@tool
def extract_details(
    summary: str,
    location: str | None = None,
    affected_people: str | None = None,
    assets: str | None = None,
    deadline: str | None = None,
    notes: str | None = None,
) -> dict:
    """Store the structured facts extracted from the request text. Never invent facts: leave unknown fields empty.

    Args:
        summary: One-sentence neutral summary of what is being asked.
        location: Where the issue/event is (room, building, street) if stated.
        affected_people: Who is affected and roughly how many, if stated.
        assets: Equipment, rooms or resources involved, if stated.
        deadline: Any date or time constraint stated by the requester.
        notes: Anything else operationally important.
    """
    req = _request()
    extracted = {
        k: v
        for k, v in {
            "location": location,
            "affected_people": affected_people,
            "assets": assets,
            "deadline": deadline,
            "notes": notes,
        }.items()
        if v
    }
    req.summary = summary
    req.extracted = extracted
    log_event("extract_details", {"summary": summary}, extracted)
    return {"summary": summary, "extracted": extracted}


@tool
def search_community_knowledge(query: str) -> dict:
    """Search the organization's knowledge base (policies, procedures, hours, contacts) and the team directory.

    Always call this before assigning work or promising anything to a requester. If nothing relevant is
    returned, say that the organization has no documented policy instead of inventing one.

    Args:
        query: Natural-language search query.
    """
    ctx = current()
    results = kb.search(ctx.db, query)
    teams = kb.directory(ctx.db)
    log_event(
        "search_community_knowledge",
        {"query": query},
        {"matches": [r["title"] for r in results], "teams": [t["name"] for t in teams]},
    )
    return {"results": results, "directory": teams, "policy_found": bool(results)}


# --------------------------------------------------------------------------- planning & acting
@tool
def assign_request(team: str, reason: str) -> dict:
    """Assign the current request to a team from the organization directory.

    Args:
        team: Exact team name from the directory returned by search_community_knowledge.
        reason: One short sentence explaining why this team is responsible.
    """
    ctx = current()
    req = _request()
    t = ctx.db.query(Team).filter(func.lower(Team.name) == team.lower()).first()
    if t is None:
        names = [x.name for x in ctx.db.query(Team).all()]
        return {"error": f"Team '{team}' is not in the directory. Known teams: {names}"}
    req.assigned_team = t.name
    if req.status in ("new", "triaged"):
        req.status = "assigned"
    _add_reasoning(req, "assign", reason)
    log_event("assign_request", {"team": t.name}, {"team": t.name, "contact": t.contact}, reason=reason)
    return {"team": t.name, "contact": t.contact, "lead": t.lead}


@tool
def create_task(title: str, details: str, team: str | None = None) -> dict:
    """Create a structured work task for the responsible team. The due date follows the request's SLA.

    Args:
        title: Short imperative task title.
        details: What needs to be done, including the extracted facts the team needs.
        team: Team name; defaults to the request's assigned team.
    """
    ctx = current()
    req = _request()
    team_name = team or req.assigned_team
    if not team_name:
        return {"error": "Assign the request to a team before creating a task"}
    task = Task(
        request_id=req.id,
        title=title,
        details=details,
        team=team_name,
        due_at=req.due_at or utcnow() + timedelta(hours=_sla_hours(req.priority)),
    )
    ctx.db.add(task)
    ctx.db.flush()
    log_event(
        "create_task",
        {"title": title, "team": team_name},
        {"task_id": task.id, "due_at": task.due_at.isoformat()},
    )
    return {"task_id": task.id, "title": title, "team": team_name, "due_at": task.due_at.isoformat()}


@tool
def update_task(task_id: int, status: str, note: str) -> dict:
    """Update a task's status with a progress note.

    Args:
        task_id: The task id.
        status: One of open, in_progress, blocked, done.
        note: Progress note.
    """
    ctx = current()
    task = ctx.db.get(Task, task_id)
    if task is None:
        return {"error": f"Task {task_id} not found"}
    if status not in ("open", "in_progress", "blocked", "done"):
        return {"error": "status must be open, in_progress, blocked or done"}
    task.status = status
    task.last_update_note = note
    task.updated_at = utcnow()
    req = task.request
    if status == "in_progress" and req.status in ("assigned", "triaged"):
        req.status = "in_progress"
    log_event("update_task", {"task_id": task_id, "status": status}, {"status": status}, reason=note)
    return {"task_id": task_id, "status": status}


@tool
def get_task_status() -> dict:
    """Return the tasks of the current request with how long ago each was last updated and whether it is overdue."""
    req = _request()
    now = utcnow()
    tasks = []
    for t in req.tasks:
        tasks.append(
            {
                "task_id": t.id,
                "title": t.title,
                "team": t.team,
                "status": t.status,
                "hours_since_update": round((now - (t.updated_at or t.created_at)).total_seconds() / 3600, 1),
                "overdue": bool(t.due_at and t.due_at < now and t.status != "done"),
                "last_update_note": t.last_update_note,
            }
        )
    result = {
        "request_status": req.status,
        "priority": req.priority,
        "request_overdue": bool(req.due_at and req.due_at < now and req.status not in ("resolved", "closed")),
        "already_escalated": req.escalated,
        "tasks": tasks,
    }
    log_event("get_task_status", {}, {"tasks": len(tasks), "request_overdue": result["request_overdue"]})
    return result


@tool
def draft_response(message: str) -> dict:
    """Save a plain-language reply to the requester acknowledging the request and what happens next.

    Only include commitments that are backed by knowledge-base results. Do not promise dates or actions
    the organization has not documented.

    Args:
        message: The full reply text.
    """
    req = _request()
    req.response_draft = message
    log_event("draft_response", {"chars": len(message)}, {"preview": message[:120]})
    return {"saved": True}


@tool
def send_notification(recipient: str, subject: str, body: str, channel: str = "email") -> dict:
    """Send a notification (requester acknowledgement, team assignment notice, reminder).

    Args:
        recipient: Person or team the message goes to (name, email or team name).
        subject: Short subject line.
        body: Message body.
        channel: email, sms or internal.
    """
    ctx = current()
    req = _request()
    payload = {"recipient": recipient, "subject": subject, "body": body, "channel": channel}
    if _needs_approval("send_notification"):
        return _request_approval(
            "send_notification",
            payload,
            f"Send {channel} to {recipient}: “{subject}”",
            "Organization policy requires review before external communication is sent.",
        )
    n = Notification(request_id=req.id, **payload, status="sent")
    ctx.db.add(n)
    ctx.db.flush()
    log_event(
        "send_notification",
        {"recipient": recipient, "channel": channel, "subject": subject},
        {"notification_id": n.id, "status": "sent"},
    )
    return {"notification_id": n.id, "status": "sent"}


@tool
def schedule_followup(hours_from_now: float, note: str) -> dict:
    """Schedule an automatic follow-up check. The monitor will re-open the request at that time.

    Args:
        hours_from_now: When to check back (hours). Use the organization's follow-up policy for the priority.
        note: What to check for at follow-up time.
    """
    ctx = current()
    req = _request()
    due = utcnow() + timedelta(hours=max(0.1, float(hours_from_now)))
    fu = FollowUp(request_id=req.id, due_at=due, note=note)
    ctx.db.add(fu)
    ctx.db.flush()
    log_event(
        "schedule_followup",
        {"hours_from_now": hours_from_now},
        {"followup_id": fu.id, "due_at": due.isoformat()},
        reason=note,
    )
    return {"followup_id": fu.id, "due_at": due.isoformat()}


@tool
def escalate_request(escalate_to: str, reason: str) -> dict:
    """Escalate a stalled or high-impact request to a manager or leadership. This is a high-risk action and
    is routed for human approval before it takes effect.

    Args:
        escalate_to: Person or role to escalate to (e.g. "Operations Director").
        reason: Why escalation is warranted, based on observed task status.
    """
    ctx = current()
    req = _request()
    payload = {"escalate_to": escalate_to, "reason": reason}
    if _needs_approval("escalate_request"):
        return _request_approval(
            "escalate_request",
            payload,
            f"Escalate to {escalate_to}",
            reason,
        )
    return _do_escalate(ctx.db, req, payload)


def _do_escalate(db, req: Request, payload: dict) -> dict:
    req.escalated = True
    req.status = "escalated"
    if req.priority in ("low", "medium"):
        req.priority = "high"
    _add_reasoning(req, "escalate", payload["reason"])
    n = Notification(
        request_id=req.id,
        recipient=payload["escalate_to"],
        channel="internal",
        subject=f"Escalation: {req.title}",
        body=payload["reason"],
    )
    db.add(n)
    db.flush()
    log_event(
        "escalate_request",
        payload,
        {"status": "escalated", "notification_id": n.id},
        reason=payload["reason"],
    )
    return {"status": "escalated", "escalated_to": payload["escalate_to"]}


@tool
def resolve_request(outcome: str) -> dict:
    """Mark the request as resolved and record the outcome. High-risk: routed for human approval.

    Args:
        outcome: What was done and the final result, for the record.
    """
    ctx = current()
    req = _request()
    payload = {"outcome": outcome}
    if _needs_approval("resolve_request"):
        return _request_approval(
            "resolve_request",
            payload,
            "Mark request as resolved",
            "Closing a case is irreversible for the requester.",
        )
    return _do_resolve(ctx.db, req, payload)


def _do_resolve(db, req: Request, payload: dict) -> dict:
    req.status = "resolved"
    req.outcome = payload["outcome"]
    req.resolved_at = utcnow()
    for t in req.tasks:
        if t.status != "done":
            t.status = "done"
            t.last_update_note = "Closed with request"
    for fu in req.followups:
        if fu.status == "scheduled":
            fu.status = "cancelled"
    log_event("resolve_request", payload, {"status": "resolved"})
    return {"status": "resolved"}


@tool
def record_decision(summary: str) -> dict:
    """Record a concise, requester-safe decision summary for the transparency panel (no hidden reasoning).

    Args:
        summary: One or two sentences summarising what the agent decided and why.
    """
    req = _request()
    _add_reasoning(req, "summary", summary)
    log_event("record_decision", {}, {"summary": summary})
    return {"recorded": True}


# --------------------------------------------------------------------------- reporting
@tool
def get_dashboard_metrics() -> dict:
    """Return live operational metrics: totals, open/overdue/high-priority counts and average resolution time."""
    from app.services.metrics import dashboard_metrics  # local import: metrics imports models

    m = dashboard_metrics(current().db)
    log_event("get_dashboard_metrics", {}, {"total": m["total_requests"], "overdue": m["overdue_requests"]})
    return m


@tool
def generate_report(period_days: int = 7) -> dict:
    """Generate an administrator summary report of the last N days.

    Args:
        period_days: Reporting window in days.
    """
    from app.services.metrics import build_report

    report = build_report(current().db, period_days)
    log_event("generate_report", {"period_days": period_days}, {"requests": report["totals"]["received"]})
    return report


ALL_TOOLS = [
    classify_request,
    set_priority,
    extract_details,
    search_community_knowledge,
    assign_request,
    create_task,
    update_task,
    get_task_status,
    draft_response,
    send_notification,
    schedule_followup,
    escalate_request,
    resolve_request,
    record_decision,
    get_dashboard_metrics,
    generate_report,
]


def execute_approved(db, approval: Approval) -> dict:
    """Run the action behind an approved `Approval` (called from the approvals API)."""
    req = db.get(Request, approval.request_id)
    payload = approval.proposed_action
    if approval.action == "escalate_request":
        return _do_escalate(db, req, payload)
    if approval.action == "resolve_request":
        return _do_resolve(db, req, payload)
    if approval.action == "send_notification":
        n = Notification(request_id=req.id, **payload, status="sent")
        db.add(n)
        db.flush()
        log_event("send_notification", payload, {"notification_id": n.id, "status": "sent"})
        return {"notification_id": n.id, "status": "sent"}
    raise ValueError(f"No executor for action {approval.action}")
