"""Background monitor: runs due follow-ups and catches overdue requests.

This is what makes CivicFlow an agent rather than a form processor: it keeps watching work after
the initial triage and re-engages (reminder, escalation recommendation) without a human asking.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from sqlalchemy.orm import Session

from app.agent.orchestrator import run_followup
from app.db.models import Approval, FollowUp, Request, utcnow
from app.db.session import session_scope

log = logging.getLogger("civicflow.monitor")
OPEN = ("assigned", "in_progress", "triaged")


def run_monitor_cycle(db: Session) -> dict:
    now = utcnow()
    checked: list[int] = []

    due = db.query(FollowUp).filter(FollowUp.status == "scheduled", FollowUp.due_at <= now).all()
    for fu in due:
        fu.status = "completed"
        fu.completed_at = now
        req = fu.request
        if req.status in ("resolved", "closed", "awaiting_approval"):
            continue
        if req.id not in checked:
            run_followup(db, req)
            checked.append(req.id)

    overdue = db.query(Request).filter(Request.status.in_(OPEN), Request.due_at < now).all()
    for req in overdue:
        if req.id in checked or req.escalated:
            continue
        pending = (
            db.query(Approval).filter(Approval.request_id == req.id, Approval.status == "pending").count()
        )
        if pending:
            continue
        run_followup(db, req)
        checked.append(req.id)

    db.flush()
    return {"followups_run": len(due), "requests_checked": checked, "at": now.isoformat()}


def advance_time(db: Session, request_id: int, hours: float) -> dict:
    """Demo helper: pretend `hours` have passed for one request by back-dating its timestamps."""
    req = db.get(Request, request_id)
    if req is None:
        raise KeyError(request_id)
    delta = timedelta(hours=hours)
    if req.due_at:
        req.due_at -= delta
    for t in req.tasks:
        t.updated_at = (t.updated_at or t.created_at) - delta
        if t.due_at:
            t.due_at -= delta
    for fu in req.followups:
        fu.due_at -= delta
    db.flush()
    return {
        "request_id": req.id,
        "simulated_hours": hours,
        "due_at": req.due_at.isoformat() if req.due_at else None,
    }


async def monitor_loop(interval_seconds: int, stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            with session_scope() as db:
                result = await asyncio.to_thread(run_monitor_cycle, db)
                if result["requests_checked"]:
                    log.info("monitor cycle: %s", result)
        except Exception:  # noqa: BLE001
            log.exception("monitor cycle failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval_seconds)
        except TimeoutError:
            pass
