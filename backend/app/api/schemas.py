from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RequestCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10, max_length=5000)
    requester_name: str = Field(default="Anonymous", max_length=120)
    requester_contact: str | None = Field(default=None, max_length=200)
    channel: Literal["web_form", "email", "whatsapp", "phone", "walk_in", "other"] = "web_form"


class TaskOut(ORM):
    id: int
    title: str
    details: str | None
    team: str
    status: str
    due_at: datetime | None
    created_at: datetime
    updated_at: datetime
    last_update_note: str | None


class TaskUpdate(BaseModel):
    status: Literal["open", "in_progress", "blocked", "done"]
    note: str = Field(default="", max_length=1000)


class ApprovalOut(ORM):
    id: int
    request_id: int
    action: str
    risk: str
    recommendation: str
    reason: str
    proposed_action: dict
    status: str
    decided_by: str | None
    decision_note: str | None
    created_at: datetime
    decided_at: datetime | None
    request_title: str | None = None


class ApprovalDecision(BaseModel):
    decision: Literal["approve", "reject", "modify"]
    decided_by: str = Field(default="Coordinator", max_length=120)
    note: str | None = Field(default=None, max_length=1000)
    modified_action: dict | None = None


class EventOut(ORM):
    id: int
    request_id: int | None
    agent: str
    action: str
    input: dict
    result: dict
    confidence: float | None
    reason: str | None
    requires_approval: bool
    timestamp: datetime
    request_title: str | None = None


class NotificationOut(ORM):
    id: int
    recipient: str
    channel: str
    subject: str
    body: str
    status: str
    created_at: datetime


class FollowUpOut(ORM):
    id: int
    due_at: datetime
    note: str
    status: str
    completed_at: datetime | None


class RequestOut(ORM):
    id: int
    title: str
    description: str
    requester_name: str
    requester_contact: str | None
    channel: str
    category: str | None
    priority: str | None
    status: str
    assigned_team: str | None
    summary: str | None
    extracted: dict
    response_draft: str | None
    reasoning: list
    due_at: datetime | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    escalated: bool
    outcome: str | None
    is_demo: bool
    overdue: bool = False
    pending_approvals: int = 0
    task_count: int = 0


class RequestDetail(RequestOut):
    tasks: list[TaskOut]
    events: list[EventOut]
    approvals: list[ApprovalOut]
    notifications: list[NotificationOut]
    followups: list[FollowUpOut]


class KnowledgeIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    category: Literal["policy", "procedure", "faq", "contact", "hours", "responsibility", "guideline"]
    content: str = Field(min_length=10, max_length=8000)
    tags: list[str] = []


class KnowledgeOut(ORM):
    id: int
    title: str
    category: str
    content: str
    tags: list
    created_at: datetime
    updated_at: datetime


class TeamOut(ORM):
    id: int
    name: str
    responsibilities: str
    contact: str
    categories: list
    lead: str | None


class SettingUpdate(BaseModel):
    value: dict
