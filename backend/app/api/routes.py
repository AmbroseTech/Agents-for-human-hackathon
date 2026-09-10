from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.agent import orchestrator
from app.agent.context import bind, log_event
from app.agent.tools import execute_approved
from app.api import schemas
from app.db.models import AgentEvent, Approval, KnowledgeItem, Request, Task, Team, utcnow
from app.db.session import get_db
from app.domain import CATEGORIES, PRIORITIES, STATUSES
from app.services import knowledge as kb
from app.services import metrics, monitor, seed
from app.services.settings import get_all_settings, update_setting

router = APIRouter(prefix="/api")


def _req_or_404(db: Session, request_id: int) -> Request:
    req = db.get(Request, request_id)
    if req is None:
        raise HTTPException(404, "Request not found")
    return req


def _request_out(req: Request) -> schemas.RequestOut:
    out = schemas.RequestOut.model_validate(req)
    now = utcnow()
    out.overdue = bool(req.due_at and req.due_at < now and req.status not in ("resolved", "closed"))
    out.pending_approvals = sum(1 for a in req.approvals if a.status == "pending")
    out.task_count = len(req.tasks)
    return out


def _detail(req: Request) -> schemas.RequestDetail:
    base = _request_out(req).model_dump()
    return schemas.RequestDetail(
        **base,
        tasks=[schemas.TaskOut.model_validate(t) for t in req.tasks],
        events=[schemas.EventOut.model_validate(e) for e in req.events],
        approvals=[schemas.ApprovalOut.model_validate(a) for a in req.approvals],
        notifications=[schemas.NotificationOut.model_validate(n) for n in req.notifications],
        followups=[schemas.FollowUpOut.model_validate(f) for f in req.followups],
    )


# ----------------------------------------------------------------------------- meta
@router.get("/health")
def health(db: Session = Depends(get_db)):
    return {
        "status": "ok",
        "agent": orchestrator.model_info(),
        "requests": db.query(Request).count(),
        "time": utcnow().isoformat(),
    }


@router.get("/meta")
def meta():
    return {
        "categories": CATEGORIES,
        "priorities": PRIORITIES,
        "statuses": STATUSES,
        "scenarios": seed.SCENARIOS,
    }


# ----------------------------------------------------------------------------- requests
@router.get("/requests", response_model=list[schemas.RequestOut])
def list_requests(
    status: str | None = None,
    category: str | None = None,
    priority: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Request)
    if status:
        query = query.filter(Request.status == status)
    if category:
        query = query.filter(Request.category == category)
    if priority:
        query = query.filter(Request.priority == priority)
    if q:
        like = f"%{q}%"
        query = query.filter(Request.title.ilike(like) | Request.description.ilike(like))
    reqs = query.order_by(Request.created_at.desc()).all()
    return [_request_out(r) for r in reqs]


@router.post("/requests", response_model=schemas.RequestDetail, status_code=201)
def create_request(body: schemas.RequestCreate, db: Session = Depends(get_db)):
    req = Request(**body.model_dump())
    db.add(req)
    db.flush()
    try:
        orchestrator.process_request(db, req)
    except Exception as exc:  # noqa: BLE001 - the request must survive an agent failure
        with bind(db, req.id):
            log_event(
                "agent_error",
                {},
                {"error": str(exc)[:300]},
                reason="Agent run failed; left for a coordinator",
            )
    db.commit()
    db.refresh(req)
    return _detail(req)


@router.post("/requests/demo/{scenario_key}", response_model=schemas.RequestDetail, status_code=201)
def create_demo_request(scenario_key: str, db: Session = Depends(get_db)):
    try:
        s = seed.scenario(scenario_key)
    except KeyError as exc:
        raise HTTPException(404, "Unknown scenario") from exc
    body = schemas.RequestCreate(**{k: v for k, v in s.items() if k in schemas.RequestCreate.model_fields})
    req = Request(**body.model_dump(), is_demo=True)
    db.add(req)
    db.flush()
    orchestrator.process_request(db, req)
    db.commit()
    db.refresh(req)
    return _detail(req)


@router.get("/requests/{request_id}", response_model=schemas.RequestDetail)
def get_request(request_id: int, db: Session = Depends(get_db)):
    return _detail(_req_or_404(db, request_id))


@router.post("/requests/{request_id}/followup", response_model=schemas.RequestDetail)
def trigger_followup(request_id: int, db: Session = Depends(get_db)):
    """Run the follow-up monitor for one request now (what the background loop does on schedule)."""
    req = _req_or_404(db, request_id)
    if req.status in ("resolved", "closed"):
        raise HTTPException(400, "Request already resolved")
    orchestrator.run_followup(db, req)
    db.commit()
    db.refresh(req)
    return _detail(req)


@router.post("/requests/{request_id}/simulate-time", response_model=schemas.RequestDetail)
def simulate_time(request_id: int, hours: float = Query(48, gt=0, le=24 * 30), db: Session = Depends(get_db)):
    """Demo control: fast-forward the clock for one request so SLAs and follow-ups fall due."""
    _req_or_404(db, request_id)
    monitor.advance_time(db, request_id, hours)
    req = _req_or_404(db, request_id)
    with bind(db, req.id, "Demo Controller"):
        log_event(
            "simulate_time", {"hours": hours}, {"due_at": req.due_at.isoformat() if req.due_at else None}
        )
    db.commit()
    db.refresh(req)
    return _detail(req)


@router.post("/requests/{request_id}/resolve", response_model=schemas.RequestDetail)
def resolve(request_id: int, body: dict, db: Session = Depends(get_db)):
    """A human closes the case directly (humans never need approval)."""
    req = _req_or_404(db, request_id)
    outcome = str(body.get("outcome", "")).strip()
    if not outcome:
        raise HTTPException(422, "outcome is required")
    from app.agent.tools import _do_resolve

    with bind(db, req.id, "Coordinator"):
        _do_resolve(db, req, {"outcome": outcome})
    db.commit()
    db.refresh(req)
    return _detail(req)


@router.patch("/tasks/{task_id}", response_model=schemas.TaskOut)
def update_task(task_id: int, body: schemas.TaskUpdate, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    task.status = body.status
    task.last_update_note = body.note or task.last_update_note
    task.updated_at = utcnow()
    req = task.request
    if body.status == "in_progress" and req.status in ("assigned", "triaged"):
        req.status = "in_progress"
    with bind(db, req.id, "Team member"):
        log_event(
            "update_task",
            {"task_id": task_id, "status": body.status},
            {"status": body.status},
            reason=body.note,
        )
    db.commit()
    db.refresh(task)
    return task


# ----------------------------------------------------------------------------- approvals
@router.get("/approvals", response_model=list[schemas.ApprovalOut])
def list_approvals(status: str | None = "pending", db: Session = Depends(get_db)):
    q = db.query(Approval)
    if status:
        q = q.filter(Approval.status == status)
    out = []
    for a in q.order_by(Approval.created_at.desc()).all():
        o = schemas.ApprovalOut.model_validate(a)
        o.request_title = a.request.title
        out.append(o)
    return out


@router.post("/approvals/{approval_id}/decide", response_model=schemas.ApprovalOut)
def decide(approval_id: int, body: schemas.ApprovalDecision, db: Session = Depends(get_db)):
    a = db.get(Approval, approval_id)
    if a is None:
        raise HTTPException(404, "Approval not found")
    if a.status != "pending":
        raise HTTPException(409, "Approval already decided")
    req = a.request
    a.decided_by = body.decided_by
    a.decision_note = body.note
    a.decided_at = utcnow()
    with bind(db, req.id, body.decided_by):
        if body.decision == "reject":
            a.status = "rejected"
            _restore_status(req)
            log_event("approval_rejected", {"action": a.action}, {"approval_id": a.id}, reason=body.note)
        else:
            if body.decision == "modify":
                if not body.modified_action:
                    raise HTTPException(422, "modified_action is required for modify")
                a.proposed_action = {**a.proposed_action, **body.modified_action}
            a.status = "approved" if body.decision == "approve" else "modified"
            _restore_status(req)
            result = execute_approved(db, a)
            log_event(
                "approval_granted", {"action": a.action, "decision": body.decision}, result, reason=body.note
            )
    db.commit()
    db.refresh(a)
    o = schemas.ApprovalOut.model_validate(a)
    o.request_title = req.title
    return o


def _restore_status(req: Request) -> None:
    if req.status != "awaiting_approval":
        return
    if any(a.status == "pending" for a in req.approvals if a.status == "pending"):
        return
    req.status = "in_progress" if any(t.status == "in_progress" for t in req.tasks) else "assigned"


# ----------------------------------------------------------------------------- activity & metrics
@router.get("/activity", response_model=list[schemas.EventOut])
def activity(limit: int = Query(50, le=500), db: Session = Depends(get_db)):
    events = (
        db.query(AgentEvent).order_by(AgentEvent.timestamp.desc(), AgentEvent.id.desc()).limit(limit).all()
    )
    out = []
    for e in events:
        o = schemas.EventOut.model_validate(e)
        o.request_title = e.request.title if e.request else None
        out.append(o)
    return out


@router.get("/metrics")
def get_metrics(db: Session = Depends(get_db)):
    return metrics.dashboard_metrics(db)


@router.get("/reports/summary")
def report(period_days: int = Query(7, ge=1, le=365), db: Session = Depends(get_db)):
    narrative = orchestrator.run_report(db, period_days)
    data = metrics.build_report(db, period_days)
    db.commit()
    return {**data, "narrative": narrative}


@router.post("/monitor/run")
def run_monitor(db: Session = Depends(get_db)):
    result = monitor.run_monitor_cycle(db)
    db.commit()
    return result


# ----------------------------------------------------------------------------- knowledge & teams
@router.get("/knowledge", response_model=list[schemas.KnowledgeOut])
def list_knowledge(q: str | None = None, db: Session = Depends(get_db)):
    if q:
        ids = [r["id"] for r in kb.search(db, q, limit=20)]
        items = db.query(KnowledgeItem).filter(KnowledgeItem.id.in_(ids)).all() if ids else []
        return sorted(items, key=lambda i: ids.index(i.id))
    return db.query(KnowledgeItem).order_by(KnowledgeItem.updated_at.desc()).all()


@router.post("/knowledge", response_model=schemas.KnowledgeOut, status_code=201)
def add_knowledge(body: schemas.KnowledgeIn, db: Session = Depends(get_db)):
    item = KnowledgeItem(**body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/knowledge/{item_id}", response_model=schemas.KnowledgeOut)
def edit_knowledge(item_id: int, body: schemas.KnowledgeIn, db: Session = Depends(get_db)):
    item = db.get(KnowledgeItem, item_id)
    if item is None:
        raise HTTPException(404, "Knowledge item not found")
    for k, v in body.model_dump().items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/knowledge/{item_id}", status_code=204)
def delete_knowledge(item_id: int, db: Session = Depends(get_db)):
    item = db.get(KnowledgeItem, item_id)
    if item is None:
        raise HTTPException(404, "Knowledge item not found")
    db.delete(item)
    db.commit()


@router.get("/teams", response_model=list[schemas.TeamOut])
def teams(db: Session = Depends(get_db)):
    return db.query(Team).order_by(Team.name).all()


# ----------------------------------------------------------------------------- settings
@router.get("/settings")
def settings(db: Session = Depends(get_db)):
    return get_all_settings(db)


@router.put("/settings/{key}")
def put_setting(key: str, body: schemas.SettingUpdate, db: Session = Depends(get_db)):
    try:
        value = update_setting(db, key, body.value)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    db.commit()
    return value
