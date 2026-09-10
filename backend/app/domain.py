"""Shared vocabulary for the agent, the API and the UI."""

CATEGORIES = (
    "maintenance",
    "it_support",
    "event",
    "volunteer",
    "donation",
    "library",
    "complaint",
    "question",
    "safety",
    "other",
)

PRIORITIES = ("low", "medium", "high", "urgent")

# Hours until a request of the given priority is considered overdue.
DEFAULT_SLA_HOURS = {"urgent": 4, "high": 24, "medium": 72, "low": 168}

STATUSES = (
    "new",
    "triaged",
    "assigned",
    "in_progress",
    "awaiting_approval",
    "escalated",
    "resolved",
    "closed",
)

# Risk tier for every action the agent can take. Tiers at or above the configured
# approval threshold are converted into approval requests instead of being executed.
ACTION_RISK = {
    "classify_request": "low",
    "set_priority": "low",
    "extract_details": "low",
    "search_community_knowledge": "low",
    "get_task_status": "low",
    "get_dashboard_metrics": "low",
    "assign_request": "low",
    "create_task": "low",
    "update_task": "low",
    "draft_response": "low",
    "schedule_followup": "low",
    "record_decision": "low",
    "send_notification": "medium",
    "escalate_request": "high",
    "resolve_request": "high",
    "generate_report": "low",
}

RISK_ORDER = {"low": 0, "medium": 1, "high": 2}

DEFAULT_SETTINGS = {
    "organization": {
        "name": "Greenhill Community Centre & School",
        "type": "school",
        "timezone": "Africa/Kampala",
    },
    # Actions with risk >= approval_threshold need a human decision.
    "autonomy": {"approval_threshold": "high", "auto_send_requester_updates": True},
    "sla_hours": DEFAULT_SLA_HOURS,
    "followup": {
        "check_after_hours": {"urgent": 1, "high": 4, "medium": 24, "low": 72},
        "escalate_to": "Operations Director",
    },
}
