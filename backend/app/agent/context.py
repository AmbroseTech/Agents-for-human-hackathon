"""Execution context shared between the Strands agent and its tools.

Tools are plain Python functions decorated with `@tool`; they need to know which database
session and which community request they are operating on. Rather than threading those
through every tool signature (which would leak into the model-facing schema), we bind them
to a contextvar for the duration of one agent run.
"""

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.db.models import AgentEvent


@dataclass
class RunContext:
    db: Session
    request_id: int | None
    agent_name: str = "CivicFlow Orchestrator"
    events: list[AgentEvent] = field(default_factory=list)


_ctx: ContextVar[RunContext | None] = ContextVar("civicflow_run_context", default=None)


def current() -> RunContext:
    ctx = _ctx.get()
    if ctx is None:
        raise RuntimeError("Tool called outside of an agent run context")
    return ctx


@contextmanager
def bind(db: Session, request_id: int | None, agent_name: str = "CivicFlow Orchestrator"):
    token = _ctx.set(RunContext(db=db, request_id=request_id, agent_name=agent_name))
    try:
        yield _ctx.get()
    finally:
        _ctx.reset(token)


def log_event(
    action: str,
    input: dict,
    result: dict,
    *,
    reason: str | None = None,
    confidence: float | None = None,
    requires_approval: bool = False,
    request_id: int | None = None,
) -> AgentEvent:
    ctx = current()
    ev = AgentEvent(
        request_id=request_id if request_id is not None else ctx.request_id,
        agent=ctx.agent_name,
        action=action,
        input=input,
        result=result,
        reason=reason,
        confidence=confidence,
        requires_approval=requires_approval,
    )
    ctx.db.add(ev)
    ctx.db.flush()
    ctx.events.append(ev)
    return ev
