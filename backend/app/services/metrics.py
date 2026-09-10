from collections import Counter
from datetime import timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import AgentEvent, Approval, Request, utcnow

OPEN_STATUSES = ("new", "triaged", "assigned", "in_progress", "awaiting_approval", "escalated")

# Conservative estimate of manual coordination time an agent-handled request replaces.
MINUTES_SAVED_PER_REQUEST = 45


def dashboard_metrics(db: Session) -> dict:
    now = utcnow()
    reqs = db.query(Request).all()
    open_reqs = [r for r in reqs if r.status in OPEN_STATUSES]
    resolved = [r for r in reqs if r.status in ("resolved", "closed")]
    overdue = [r for r in open_reqs if r.due_at and r.due_at < now]
    high = [r for r in open_reqs if r.priority in ("high", "urgent")]
    durations = [(r.resolved_at - r.created_at).total_seconds() / 3600 for r in resolved if r.resolved_at]
    avg_res = round(sum(durations) / len(durations), 1) if durations else None

    agent_actions = db.query(func.count(AgentEvent.id)).scalar() or 0
    pending = db.query(func.count(Approval.id)).filter(Approval.status == "pending").scalar() or 0
    auto_routed = sum(1 for r in reqs if r.assigned_team)
    prevented = sum(1 for r in reqs if r.escalated and r.status in ("resolved", "closed"))

    by_category = Counter(r.category or "unclassified" for r in reqs)
    by_status = Counter(r.status for r in reqs)
    by_priority = Counter(r.priority or "unset" for r in open_reqs)

    return {
        "total_requests": len(reqs),
        "open_requests": len(open_reqs),
        "resolved_requests": len(resolved),
        "overdue_requests": len(overdue),
        "high_priority_requests": len(high),
        "avg_resolution_hours": avg_res,
        "agent_actions": agent_actions,
        "pending_approvals": pending,
        "requests_by_category": dict(by_category),
        "requests_by_status": dict(by_status),
        "open_by_priority": dict(by_priority),
        "impact": {
            "requests_processed": agent_actions and len(reqs),
            "hours_saved_estimate": round(len(reqs) * MINUTES_SAVED_PER_REQUEST / 60, 1),
            "auto_routed_pct": round(100 * auto_routed / len(reqs)) if reqs else 0,
            "escalations_resolved": prevented,
            "is_demo": any(r.is_demo for r in reqs),
        },
    }


def build_report(db: Session, period_days: int = 7) -> dict:
    since = utcnow() - timedelta(days=period_days)
    received = db.query(Request).filter(Request.created_at >= since).all()
    resolved = [r for r in received if r.status in ("resolved", "closed")]
    overdue = [
        r for r in db.query(Request).all() if r.due_at and r.due_at < utcnow() and r.status in OPEN_STATUSES
    ]
    escalated = [r for r in received if r.escalated]
    by_team = Counter(r.assigned_team or "unassigned" for r in received)
    by_category = Counter(r.category or "unclassified" for r in received)
    return {
        "period_days": period_days,
        "generated_at": utcnow().isoformat(),
        "totals": {
            "received": len(received),
            "resolved": len(resolved),
            "escalated": len(escalated),
            "currently_overdue": len(overdue),
        },
        "by_team": dict(by_team),
        "by_category": dict(by_category),
        "overdue": [
            {
                "id": r.id,
                "title": r.title,
                "team": r.assigned_team,
                "priority": r.priority,
                "due_at": r.due_at.isoformat(),
            }
            for r in overdue
        ],
        "highlights": [
            f"{len(received)} requests received in the last {period_days} days, {len(resolved)} resolved.",
            f"{len(overdue)} request(s) currently overdue"
            + (f"; busiest team: {by_team.most_common(1)[0][0]}." if by_team else "."),
        ],
    }
