"""The CivicFlow Orchestrator: a Strands `Agent` wired to the operational tools.

Three entry points, all of which run the same agent loop against the same tools:

* `process_request`  – intake: understand → classify → prioritize → plan → assign → notify → schedule follow-up
* `run_followup`     – monitor: inspect task progress, escalate (via approval) if stalled
* `run_report`       – reporting: summarise a period for administrators
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache

from strands import Agent
from strands.models.model import Model

from app.agent.context import bind
from app.agent.local_model import LocalPolicyModel
from app.agent.tools import ALL_TOOLS
from app.config import get_settings
from app.db.models import Request
from app.services.settings import get_all_settings

log = logging.getLogger("civicflow.agent")

SYSTEM_PROMPT = """You are CivicFlow, an autonomous community-operations agent for a small organization
(school, library, nonprofit or community group). You do not chat; you get work done using tools.

For each new request, work through this checklist, calling one tool at a time:
1. search_community_knowledge – ground yourself in policies and the team directory first.
2. classify_request – exactly one category.
3. set_priority – urgent only for hazards; high when people are blocked from an essential service.
4. extract_details – only facts stated in the request. Never invent locations, counts or dates.
5. assign_request – a team from the directory whose responsibilities match. If none matches, say so.
6. create_task – an imperative title plus the facts the team needs.
7. draft_response – a warm, plain-language acknowledgement; promise only what the knowledge base supports.
8. send_notification – to the requester (if allowed) and to the assigned team.
9. schedule_followup – using the organization's follow-up policy.
10. record_decision – one or two requester-safe sentences summarising what you did and why.

For follow-up checks: call get_task_status; if the work is stalled or overdue and not already escalated,
call escalate_request (a human will approve it); otherwise schedule the next check. Finish with record_decision.

Rules: be transparent and concise; never expose private reasoning; treat external communication,
escalation and closing a case as sensitive – the tools route them for human approval automatically.
Finish with a single short sentence for the activity log."""


class ModelUnavailable(RuntimeError):
    pass


@lru_cache
def build_model() -> tuple[Model, str]:
    """Pick Bedrock when configured/available, otherwise the offline policy model."""
    cfg = get_settings()
    if cfg.model_provider in ("auto", "bedrock"):
        try:
            import boto3
            from strands.models import BedrockModel

            session = boto3.Session(region_name=cfg.aws_region)
            if session.get_credentials() is None:
                raise ModelUnavailable("no AWS credentials")
            model = BedrockModel(model_id=cfg.bedrock_model_id, boto_session=session, temperature=0.1)
            log.info("Using Bedrock model %s", cfg.bedrock_model_id)
            return model, f"bedrock:{cfg.bedrock_model_id}"
        except Exception as exc:  # noqa: BLE001 - any failure falls back to offline mode
            if cfg.model_provider == "bedrock":
                raise
            log.warning("Bedrock unavailable (%s); using LocalPolicyModel", exc)
    return LocalPolicyModel(), "local-policy"


def model_info() -> dict:
    _, name = build_model()
    return {
        "provider": "bedrock" if name.startswith("bedrock") else "local",
        "model": name,
        "sdk": "strands-agents",
    }


def _agent() -> Agent:
    model, _ = build_model()
    return Agent(model=model, tools=ALL_TOOLS, system_prompt=SYSTEM_PROMPT, callback_handler=None)


def _request_payload(req: Request) -> dict:
    return {
        "id": req.id,
        "title": req.title,
        "description": req.description,
        "requester_name": req.requester_name,
        "requester_contact": req.requester_contact,
        "channel": req.channel,
        "category": req.category,
        "priority": req.priority,
        "status": req.status,
    }


def _run(db, req: Request | None, mode: str, payload: dict, agent_name: str) -> str:
    task = {"mode": mode, "request": payload, "settings": get_all_settings(db)}
    prompt = f"{mode.upper()} task for CivicFlow.\nCIVICFLOW_TASK: {json.dumps(task, default=str)}"
    with bind(db, req.id if req else None, agent_name):
        result = _agent()(prompt)
    db.flush()
    return str(result).strip()


def process_request(db, req: Request) -> str:
    return _run(db, req, "intake", _request_payload(req), "CivicFlow Orchestrator")


def run_followup(db, req: Request) -> str:
    return _run(db, req, "monitor", _request_payload(req), "Follow-up Monitor")


def run_report(db, period_days: int = 7) -> str:
    return _run(db, None, "report", {"period_days": period_days}, "Reporting Agent")
