"""End-to-end tests of the agent loop through the HTTP API (offline LocalPolicyModel)."""


def _actions(detail: dict) -> list[str]:
    return [e["action"] for e in detail["events"]]


def test_health_reports_agent(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["agent"]["sdk"] == "strands-agents"
    assert body["agent"]["provider"] == "local"


def test_intake_runs_full_workflow(client):
    r = client.post("/api/requests/demo/school_lab")
    assert r.status_code == 201
    d = r.json()
    assert d["category"] == "it_support"
    assert d["priority"] == "high"
    assert d["assigned_team"] == "ICT Support"
    assert d["status"] == "assigned"
    assert d["extracted"]["assets"] == "6 computers"
    assert d["extracted"]["affected_people"] == "40 students"
    assert "digital learning lab" in d["extracted"]["location"].lower()
    assert len(d["tasks"]) == 1 and d["tasks"][0]["team"] == "ICT Support"
    assert len(d["notifications"]) == 2  # requester + team
    assert len(d["followups"]) == 1
    assert "Ms. Amina" in d["response_draft"]
    assert "Digital learning lab support policy" in d["response_draft"]
    acts = _actions(d)
    assert (
        acts.index("search_community_knowledge")
        < acts.index("classify_request")
        < acts.index("assign_request")
    )
    assert acts[-1] == "record_decision"
    assert any(step["step"] == "summary" for step in d["reasoning"])


def test_followup_escalation_requires_approval(client):
    d = client.post("/api/requests/demo/school_lab").json()
    rid = d["id"]
    client.post(f"/api/requests/{rid}/simulate-time", params={"hours": 30})
    d = client.post(f"/api/requests/{rid}/followup").json()
    assert d["status"] == "awaiting_approval"
    assert d["escalated"] is False
    pending = [a for a in d["approvals"] if a["status"] == "pending"]
    assert len(pending) == 1 and pending[0]["action"] == "escalate_request" and pending[0]["risk"] == "high"

    # Re-running the monitor must not create a duplicate approval
    d = client.post(f"/api/requests/{rid}/followup").json()
    assert len([a for a in d["approvals"] if a["status"] == "pending"]) == 1

    r = client.post(
        f"/api/approvals/{pending[0]['id']}/decide", json={"decision": "approve", "decided_by": "Ops"}
    )
    assert r.status_code == 200 and r.json()["status"] == "approved"
    d = client.get(f"/api/requests/{rid}").json()
    assert d["status"] == "escalated" and d["escalated"] is True
    assert any(n["subject"].startswith("Escalation") for n in d["notifications"])

    # Cannot decide twice
    r = client.post(f"/api/approvals/{pending[0]['id']}/decide", json={"decision": "approve"})
    assert r.status_code == 409


def test_rejecting_approval_restores_status(client):
    d = client.post("/api/requests/demo/urgent_maintenance").json()
    assert d["category"] == "safety" and d["priority"] == "urgent"
    rid = d["id"]
    client.post(f"/api/requests/{rid}/simulate-time", params={"hours": 10})
    d = client.post(f"/api/requests/{rid}/followup").json()
    approval = next(a for a in d["approvals"] if a["status"] == "pending")
    client.post(
        f"/api/approvals/{approval['id']}/decide", json={"decision": "reject", "note": "Handled offline"}
    )
    d = client.get(f"/api/requests/{rid}").json()
    assert d["status"] == "assigned" and d["escalated"] is False


def test_unknown_topic_is_not_invented(client):
    r = client.post(
        "/api/requests",
        json={
            "title": "Zebra parade coordination",
            "description": "Something with dancing zebras that fits nothing.",
        },
    )
    d = r.json()
    assert d["category"] == "other"
    assert d["assigned_team"] == "Operations Office"
    assert "no documented policy" in d["response_draft"]


def test_human_resolution_and_metrics(client):
    d = client.post("/api/requests/demo/volunteer").json()
    assert d["category"] == "volunteer"
    rid = d["id"]
    r = client.post(f"/api/requests/{rid}/resolve", json={"outcome": "Volunteer onboarded."})
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "resolved" and all(t["status"] == "done" for t in d["tasks"])
    m = client.get("/api/metrics").json()
    assert m["total_requests"] >= 5 and m["resolved_requests"] >= 1
    assert "volunteer" in m["requests_by_category"]


def test_task_update_and_activity(client):
    d = client.post("/api/requests/demo/donation").json()
    assert d["category"] == "donation" and d["assigned_team"] == "Fundraising & Donations"
    task = d["tasks"][0]
    r = client.patch(f"/api/tasks/{task['id']}", json={"status": "in_progress", "note": "Collection booked"})
    assert r.status_code == 200 and r.json()["status"] == "in_progress"
    assert client.get(f"/api/requests/{d['id']}").json()["status"] == "in_progress"
    events = client.get("/api/activity", params={"limit": 5}).json()
    assert events[0]["action"] == "update_task"


def test_knowledge_crud_and_search(client):
    r = client.post(
        "/api/knowledge",
        json={
            "title": "Playground rules",
            "category": "policy",
            "content": "Playground closes at dusk daily.",
            "tags": [],
        },
    )
    assert r.status_code == 201
    item = r.json()
    hits = client.get("/api/knowledge", params={"q": "playground dusk"}).json()
    assert hits and hits[0]["id"] == item["id"]
    assert client.delete(f"/api/knowledge/{item['id']}").status_code == 204


def test_settings_roundtrip(client):
    r = client.put("/api/settings/autonomy", json={"value": {"approval_threshold": "medium"}})
    assert r.status_code == 200 and r.json()["approval_threshold"] == "medium"
    d = client.post("/api/requests/demo/library").json()
    # with a medium threshold, notifications now need approval
    assert any(a["action"] == "send_notification" for a in d["approvals"])
    client.put("/api/settings/autonomy", json={"value": {"approval_threshold": "high"}})
    assert client.put("/api/settings/nope", json={"value": {}}).status_code == 404


def test_report_and_monitor(client):
    r = client.get("/api/reports/summary", params={"period_days": 7})
    assert r.status_code == 200 and "narrative" in r.json()
    r = client.post("/api/monitor/run")
    assert r.status_code == 200 and "requests_checked" in r.json()
