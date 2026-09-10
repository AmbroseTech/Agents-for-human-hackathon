"""Demo organization: teams, knowledge base and reproducible request scenarios."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy.orm import Session

from app.db.models import KnowledgeItem, Request, Team, utcnow

TEAMS = [
    {
        "name": "Facilities & Maintenance",
        "responsibilities": "Building repairs, plumbing, electrical faults, furniture, grounds, roof and fence repairs.",
        "contact": "facilities@greenhill.example",
        "categories": ["maintenance"],
        "lead": "Grace Nakato",
    },
    {
        "name": "ICT Support",
        "responsibilities": "Computers, the digital learning lab, Wi-Fi, projectors, printers, accounts and passwords.",
        "contact": "ict@greenhill.example",
        "categories": ["it_support"],
        "lead": "David Okello",
    },
    {
        "name": "Events & Community Programs",
        "responsibilities": "Hall bookings, community events, workshops, ceremonies and outreach programs.",
        "contact": "events@greenhill.example",
        "categories": ["event"],
        "lead": "Sarah Achieng",
    },
    {
        "name": "Volunteer Coordination",
        "responsibilities": "Recruiting, screening and scheduling volunteers, mentors and tutors.",
        "contact": "volunteers@greenhill.example",
        "categories": ["volunteer"],
        "lead": "Peter Mugisha",
    },
    {
        "name": "Fundraising & Donations",
        "responsibilities": "Cash and in-kind donations, donor receipts, sponsorships and fundraising drives.",
        "contact": "giving@greenhill.example",
        "categories": ["donation"],
        "lead": "Ruth Kembabazi",
    },
    {
        "name": "Library Services",
        "responsibilities": "Library membership, lending, catalogue, reading programs and study space.",
        "contact": "library@greenhill.example",
        "categories": ["library"],
        "lead": "Joseph Byaruhanga",
    },
    {
        "name": "Operations Office",
        "responsibilities": "Complaints, general questions, safety incidents and anything not covered by another team.",
        "contact": "operations@greenhill.example",
        "categories": ["complaint", "question", "safety", "other"],
        "lead": "Operations Director",
    },
]

KNOWLEDGE = [
    {
        "title": "Digital learning lab support policy",
        "category": "procedure",
        "tags": ["it", "lab", "computers"],
        "content": (
            "The digital learning lab is maintained by ICT Support. Faults affecting more than two computers "
            "or blocking a scheduled class are treated as high priority and must be triaged within 24 hours. "
            "ICT Support logs the fault, checks power and network first, then swaps spare units from the store. "
            "Teachers are informed of the expected restoration time."
        ),
    },
    {
        "title": "Facilities repair procedure",
        "category": "procedure",
        "tags": ["maintenance", "repairs"],
        "content": (
            "Facilities & Maintenance handles all building repairs. Leaks, exposed wiring and blocked toilets "
            "are urgent and must be made safe the same day. Routine repairs (lights, doors, paint) are scheduled "
            "within one week. Contractors above UGX 500,000 require the Operations Director's approval."
        ),
    },
    {
        "title": "Community hall booking guidelines",
        "category": "policy",
        "tags": ["events", "hall", "booking"],
        "content": (
            "The community hall may be booked by residents and partner organizations at least 10 days in advance. "
            "Bookings are confirmed by Events & Community Programs after checking the calendar. The hall seats "
            "150 people; events after 21:00 need a noise waiver. Weekend bookings incur a cleaning fee."
        ),
    },
    {
        "title": "Volunteer onboarding",
        "category": "procedure",
        "tags": ["volunteers", "onboarding"],
        "content": (
            "New volunteers complete a short application, provide one reference and attend a 1-hour orientation "
            "held every second Saturday. Volunteers working with children must complete a child-protection "
            "briefing before their first session. Volunteer Coordination replies to offers within 3 working days."
        ),
    },
    {
        "title": "Donations acceptance policy",
        "category": "policy",
        "tags": ["donations", "in-kind"],
        "content": (
            "Fundraising & Donations coordinates all gifts. In-kind donations (books, computers, furniture) are "
            "accepted after a quick suitability check and collected within 2 weeks. Donors receive a written "
            "acknowledgement. Cash donations are receipted within 5 working days."
        ),
    },
    {
        "title": "Library services and hours",
        "category": "faq",
        "tags": ["library", "hours", "membership"],
        "content": (
            "The library is open Monday to Friday 08:00-18:00 and Saturday 09:00-13:00. Membership is free for "
            "students and residents; bring an ID. Up to 3 books may be borrowed for 14 days. Study rooms can be "
            "reserved by Library Services for groups of up to 8."
        ),
    },
    {
        "title": "Complaint handling standard",
        "category": "policy",
        "tags": ["complaints", "escalation"],
        "content": (
            "Complaints are acknowledged within 1 working day and receive a substantive reply within 5 working "
            "days. Complaints about staff conduct are escalated to the Operations Director and are never "
            "discussed with third parties."
        ),
    },
    {
        "title": "Escalation and follow-up policy",
        "category": "policy",
        "tags": ["escalation", "sla", "follow-up"],
        "content": (
            "If a task has no recorded progress by its follow-up check, the responsible team lead is reminded. If "
            "an urgent or high-priority task passes its due time with no progress it is escalated to the "
            "Operations Director, who must approve the escalation and may reassign the work."
        ),
    },
    {
        "title": "Contact directory and opening hours",
        "category": "contact",
        "tags": ["contacts", "hours"],
        "content": (
            "Greenhill Community Centre & School: main office open Monday-Friday 08:00-17:00, phone +256 700 000 000, "
            "email hello@greenhill.example. Emergencies outside hours: call the duty officer on +256 700 000 111."
        ),
    },
]

SCENARIOS = [
    {
        "key": "school_lab",
        "label": "School digital lab outage",
        "title": "Several computers in the digital learning lab have stopped working",
        "description": (
            "Good morning. Since Monday, 6 computers in the digital learning lab have stopped working - they "
            "power on but show no display. 40 students in Primary 6 have their ICT exam practice on Thursday "
            "and cannot use the lab. Please help urgently."
        ),
        "requester_name": "Ms. Amina Ssempala",
        "requester_contact": "amina.ssempala@greenhill.example",
        "channel": "email",
    },
    {
        "key": "hall_booking",
        "label": "Community event request",
        "title": "Request to book the community hall for a youth health fair",
        "description": (
            "Our youth group would like to hold a health awareness fair in the community hall on Saturday 21st "
            "from 10am to 4pm. We expect around 120 people and a few partner NGOs with stands. Can we book it?"
        ),
        "requester_name": "Brian Tumusiime",
        "requester_contact": "brian.t@example.org",
        "channel": "web_form",
    },
    {
        "key": "volunteer",
        "label": "Volunteer offer",
        "title": "I would like to volunteer as a reading mentor",
        "description": (
            "Hello, I'm a retired teacher and would love to volunteer two afternoons a week as a reading mentor "
            "for younger children. How do I sign up and what do you need from me?"
        ),
        "requester_name": "Margaret Atim",
        "requester_contact": "+256 772 000 222",
        "channel": "whatsapp",
    },
    {
        "key": "library",
        "label": "Library support request",
        "title": "Study room booking for exam revision group",
        "description": (
            "A group of 7 secondary students would like to reserve a library study room for revision every "
            "evening next week. Is that possible and what are the opening hours?"
        ),
        "requester_name": "Isaac Wasswa",
        "requester_contact": "isaac.w@example.org",
        "channel": "web_form",
    },
    {
        "key": "donation",
        "label": "Nonprofit donation coordination",
        "title": "Company wants to donate 15 used laptops",
        "description": (
            "Our company is refreshing its hardware and would like to donate 15 used laptops to the school. "
            "They are in good condition. When could someone collect them and do you issue acknowledgement letters?"
        ),
        "requester_name": "Kampala Tech Ltd (CSR desk)",
        "requester_contact": "csr@kampalatech.example",
        "channel": "email",
    },
    {
        "key": "urgent_maintenance",
        "label": "Urgent community maintenance",
        "title": "Water leaking from the ceiling near exposed wiring in Block B",
        "description": (
            "There is water leaking from the ceiling in the Block B corridor right next to exposed wiring. "
            "Children walk through here every morning - this is dangerous and needs to be fixed immediately."
        ),
        "requester_name": "Caretaker Moses",
        "requester_contact": "+256 700 000 333",
        "channel": "phone",
    },
]


def seed_organization(db: Session) -> None:
    if db.query(Team).count() == 0:
        for t in TEAMS:
            db.add(Team(**t))
    if db.query(KnowledgeItem).count() == 0:
        for k in KNOWLEDGE:
            db.add(KnowledgeItem(**k))
    db.flush()


def scenario(key: str) -> dict:
    for s in SCENARIOS:
        if s["key"] == key:
            return s
    raise KeyError(key)


def seed_history(db: Session, process) -> int:
    """Create a small back-catalogue of already-handled demo requests so charts are not empty."""
    if db.query(Request).count() > 0:
        return 0
    now = utcnow()
    created = 0
    for i, s in enumerate(SCENARIOS[1:5]):
        req = Request(
            title=s["title"],
            description=s["description"],
            requester_name=s["requester_name"],
            requester_contact=s["requester_contact"],
            channel=s["channel"],
            is_demo=True,
        )
        db.add(req)
        db.flush()
        process(db, req)
        # back-date so the dashboard has history
        age = timedelta(days=2 + i * 2, hours=3 * i)
        req.created_at = now - age
        for e in req.events:
            e.timestamp = now - age + timedelta(seconds=e.id)
        if i % 2 == 0:
            req.status = "resolved"
            req.outcome = "Handled by the assigned team; requester informed."
            req.resolved_at = req.created_at + timedelta(hours=10 + 6 * i)
            for t in req.tasks:
                t.status = "done"
            for fu in req.followups:
                fu.status = "completed"
        else:
            for t in req.tasks:
                t.status = "in_progress"
                t.last_update_note = "Work started."
            req.status = "in_progress"
        created += 1
    db.flush()
    return created
