<p align="center">
  <img src="frontend/public/civicflow.svg" width="72" alt="CivicFlow AI logo" />
</p>

<h1 align="center">CivicFlow AI</h1>
<p align="center"><strong>From community requests to completed action — automatically.</strong></p>
<p align="center">AWS Agents for Humans Hackathon · Track: <em>Good Neighbor Agents</em></p>

---

CivicFlow AI is an **autonomous community operations agent** for schools, community centres,
libraries, nonprofits and local initiatives that drown in coordination work. It takes every incoming
request — "the lab computers are dead before Thursday's exam", "can we book the hall?", "I'd like to
volunteer" — and turns it into organised, tracked, followed-up action:

1. **Understands** the request and extracts who / what / where / when
2. **Classifies** it (maintenance, IT, event, volunteer, donation, library, complaint, safety…)
3. **Prioritises** it against SLAs (urgent 4h · high 24h · medium 72h · low 7d)
4. **Consults the organisation's own knowledge base** before promising anything
5. **Assigns** the right team and **creates a structured task**
6. **Replies** to the requester and **briefs the team**
7. **Schedules follow-ups**, **detects overdue work** in the background
8. **Recommends escalation** — and **waits for a human to approve it**
9. **Records the outcome** and **writes the weekly report**

Every step is a real tool call with a real side-effect in the database, and every decision is logged
with a short, human-readable reason. **It is not a chatbot.**

## Demo in 60 seconds

```bash
# 1. backend (Python 3.11+)
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000       # seeds a demo school + 4 historical requests

# 2. frontend (Node 20+), in another terminal
cd frontend
npm install
npm run dev                                    # http://localhost:5173  (proxies /api → :8000)
```

Open **http://localhost:5173**, click *Open the dashboard*, then:

| Step | What to click | What you'll see |
|------|---------------|-----------------|
| 1 | **Demo scenarios → School digital lab outage** | Agent classifies as *IT support · High*, extracts *digital learning lab / 40 students / 6 computers / Thursday*, assigns **ICT Support**, creates a task, sends 2 notifications, schedules a follow-up — 11 logged actions in ~1 s |
| 2 | **Fast-forward 48h → Run follow-up now** | Request is now overdue; agent detects no progress and raises an **Escalation approval (high risk)** instead of acting alone |
| 3 | **Approve** | Status → *Escalated*; the decision and your note land in the audit trail |
| 4 | Task status → **Done**, then **Resolve request** | Outcome recorded; metrics and *Analytics → Agent-generated summary* update |
| 5 | **Urgent community maintenance** | Water + exposed wiring ⇒ classified *Safety · Urgent* (4h SLA) |
| 6 | Submit your own request about something not in the knowledge base | Reply says there is *no documented policy* — the agent does not invent one |

No AWS credentials? Everything above still works: the agent falls back to a deterministic offline
policy model (see [Model strategy](#model-strategy)). The header shows which one is active.

## Architecture

Full diagrams (system, sequence, risk policy) live in [`docs/architecture.md`](docs/architecture.md).

```
React + TS dashboard ──▶ FastAPI ──▶ CivicFlow Orchestrator (Strands Agents SDK)
                                         │  Model: Amazon Bedrock ⟷ LocalPolicyModel
                                         ▼
                        @tool: classify · set_priority · extract_details
                               search_community_knowledge · assign_request
                               create_task · draft_response · send_notification
                               schedule_followup · escalate_request · resolve_request
                               record_decision · generate_report
                                         ▼
                        SQLAlchemy ─▶ SQLite (dev) / PostgreSQL (prod)
                        Background monitor: follow-ups · overdue → escalation approvals
```

### Why this is an agent, not a chatbot

* **Tools with consequences.** The agent's output is rows in `tasks`, `notifications`, `followups`,
  `approvals` and `agent_events` — not text. The UI is a window onto those rows.
* **Closed loop.** A background monitor re-invokes the agent on schedule (`run_followup`) to check
  progress, chase stalled work and detect SLA breaches without anyone asking.
* **Grounded.** `search_community_knowledge` runs *before* assignment or any promise; if nothing
  relevant exists the requester is told so.
* **Human in control.** Actions are risk-tiered (`domain.ACTION_RISK`). High-risk actions
  (`escalate_request`, `resolve_request`) are never executed directly; they become an `Approval` the
  coordinator approves, rejects or modifies. The threshold is adjustable in Settings.
* **Transparent.** Each tool call logs a one-line reason and confidence. The request page shows a
  *decision summary* — never hidden chain-of-thought.

### How Strands Agents SDK is used

* `backend/app/agent/orchestrator.py` builds one `strands.Agent` with a system prompt and 16
  `@tool`-decorated functions (`backend/app/agent/tools.py`).
* Tools reach the current DB session and request through a context variable
  (`backend/app/agent/context.py`) so the model-facing schemas stay clean.
* The same agent loop runs three jobs: **intake**, **follow-up/monitor** and **report**.
* `backend/app/agent/local_model.py` implements Strands' `Model` interface as a rules-based policy,
  streaming standard `contentBlockStart/Delta/Stop` tool-use events. The SDK's tool loop, event
  handling and message history are identical in both modes.

### How AWS is used

| Service | Role |
|---------|------|
| **Amazon Bedrock** (Claude 3.5 Haiku via `strands.models.BedrockModel`) | Primary reasoning model when credentials are present (`MODEL_PROVIDER=auto|bedrock`) |
| **Strands Agents SDK** | Agent loop, tool calling, model abstraction |
| PostgreSQL (e.g. **Amazon RDS**) | Production database via `DATABASE_URL` |
| Planned | Bedrock Knowledge Bases / pgvector for semantic retrieval; SES / SNS behind `send_notification`; ECS Fargate or App Runner for hosting |

### Model strategy

`MODEL_PROVIDER=auto` uses Bedrock if `boto3` can find credentials, otherwise logs a warning and uses
`LocalPolicyModel`. `bedrock` fails fast if unavailable; `local` forces the offline policy (used by
the test suite so CI is deterministic).

## Project layout

```
backend/
  app/
    agent/        orchestrator.py · tools.py · local_model.py · context.py
    api/          routes.py · schemas.py
    db/           models.py · session.py
    services/     knowledge.py · metrics.py · monitor.py · seed.py · settings.py
    config.py · domain.py · main.py
  tests/          end-to-end API + agent flow tests (pytest)
frontend/
  src/
    api/          client.ts · types.ts
    components/   AppShell · Timeline · ApprovalCard · RequestTable · charts · DemoControls · ui
    pages/        Landing · Dashboard · Requests · NewRequest · RequestDetail · Approvals
                  Activity · Knowledge · Analytics · SettingsPage
docs/architecture.md
.env.example · LICENSE (MIT)
```

## API (selected)

| Method & path | Purpose |
|---------------|---------|
| `POST /api/requests` | Intake — runs the agent synchronously and returns the full decision trail |
| `POST /api/requests/demo/{scenario}` | Intake with a seeded scenario |
| `POST /api/requests/{id}/followup` | Run the follow-up agent now |
| `POST /api/requests/{id}/simulate-time?hours=48` | Demo helper: back-date timestamps |
| `POST /api/requests/{id}/resolve` | Record outcome |
| `GET/POST /api/approvals`, `POST /api/approvals/{id}/decide` | Human-in-the-loop queue |
| `GET /api/activity` | Global agent audit log |
| `GET /api/metrics`, `GET /api/reports/summary` | Dashboard metrics; agent-generated report |
| `POST /api/monitor/run` | Trigger one monitor cycle |
| `GET/POST/PUT/DELETE /api/knowledge` | Community knowledge CRUD (+ `?q=` search) |
| `GET /api/settings`, `PUT /api/settings/{key}` | Autonomy threshold, SLAs, follow-up cadence |

Interactive docs: `http://localhost:8000/docs`.

## Configuration

Copy [`.env.example`](.env.example) to `backend/.env` and adjust. Never commit credentials; AWS
credentials are read from the standard boto3 chain.

## Tests & quality

```bash
cd backend && ruff check . && ruff format --check . && pytest      # 10 end-to-end tests
cd frontend && npm run lint && npm run build
```

## Demo data & safety

The seeded organisation (*Greenhill Community Centre & School*), people and contacts are fictional.
Notifications are persisted (and shown under *Messages sent*) behind an integration boundary — no
real email or SMS leaves the system in this build. Metrics that include seeded requests are labelled *demo* in the UI.

## Roadmap

* Semantic retrieval (pgvector / Bedrock Knowledge Bases) with citations in replies
* Real channels: inbound email & WhatsApp webhooks, SES/SNS outbound
* Multi-organisation tenancy and role-based access
* Calendar integration for events and follow-ups
* Requester self-service status page

## Devpost blurb

> **CivicFlow AI** is a Good Neighbor agent for the small organisations that hold communities
> together. Built on the Strands Agents SDK and Amazon Bedrock, it reads every incoming request,
> classifies and prioritises it, checks the organisation's own policies, assigns the right team,
> creates the task, replies to the requester, follows up on its own and — when work stalls —
> recommends escalation and waits for a human to approve. Every action is a real database side-effect
> with a one-line reason attached. It's not a chatbot: it's the coordinator who never forgets.

## License

[MIT](LICENSE)
