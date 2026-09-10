export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type Status =
  'new' | 'triaged' | 'assigned' | 'in_progress' | 'awaiting_approval' | 'escalated' | 'resolved' | 'closed'

export interface RequestSummary {
  id: number
  title: string
  description: string
  requester_name: string
  requester_contact: string | null
  channel: string
  category: string | null
  priority: Priority | null
  status: Status
  assigned_team: string | null
  summary: string | null
  extracted: Record<string, string>
  response_draft: string | null
  reasoning: { step: string; text: string; at: string }[]
  due_at: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  escalated: boolean
  outcome: string | null
  is_demo: boolean
  overdue: boolean
  pending_approvals: number
  task_count: number
}

export interface Task {
  id: number
  title: string
  details: string | null
  team: string
  status: 'open' | 'in_progress' | 'blocked' | 'done'
  due_at: string | null
  created_at: string
  updated_at: string
  last_update_note: string | null
}

export interface Approval {
  id: number
  request_id: number
  action: string
  risk: 'low' | 'medium' | 'high'
  recommendation: string
  reason: string
  proposed_action: Record<string, string>
  status: 'pending' | 'approved' | 'rejected' | 'modified'
  decided_by: string | null
  decision_note: string | null
  created_at: string
  decided_at: string | null
  request_title?: string | null
}

export interface AgentEvent {
  id: number
  request_id: number | null
  agent: string
  action: string
  input: Record<string, unknown>
  result: Record<string, unknown>
  confidence: number | null
  reason: string | null
  requires_approval: boolean
  timestamp: string
  request_title?: string | null
}

export interface Notification {
  id: number
  recipient: string
  channel: string
  subject: string
  body: string
  status: string
  created_at: string
}

export interface FollowUp {
  id: number
  due_at: string
  note: string
  status: string
  completed_at: string | null
}

export interface RequestDetail extends RequestSummary {
  tasks: Task[]
  events: AgentEvent[]
  approvals: Approval[]
  notifications: Notification[]
  followups: FollowUp[]
}

export interface Metrics {
  total_requests: number
  open_requests: number
  resolved_requests: number
  overdue_requests: number
  high_priority_requests: number
  avg_resolution_hours: number | null
  agent_actions: number
  pending_approvals: number
  requests_by_category: Record<string, number>
  requests_by_status: Record<string, number>
  open_by_priority: Record<string, number>
  impact: {
    requests_processed: number
    hours_saved_estimate: number
    auto_routed_pct: number
    escalations_resolved: number
    is_demo: boolean
  }
}

export interface KnowledgeItem {
  id: number
  title: string
  category: string
  content: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface Team {
  id: number
  name: string
  responsibilities: string
  contact: string
  categories: string[]
  lead: string | null
}

export interface Scenario {
  key: string
  label: string
  title: string
  description: string
  requester_name: string
  requester_contact: string
  channel: string
}

export interface Meta {
  categories: string[]
  priorities: Priority[]
  statuses: Status[]
  scenarios: Scenario[]
}

export interface Health {
  status: string
  agent: { provider: 'bedrock' | 'local'; model: string; sdk: string }
  requests: number
  time: string
}

export interface Settings {
  organization: { name: string; type: string; timezone: string }
  autonomy: { approval_threshold: 'low' | 'medium' | 'high'; auto_send_requester_updates: boolean }
  sla_hours: Record<Priority, number>
  followup: { check_after_hours: Record<Priority, number>; escalate_to: string }
  [key: string]: unknown
}

export interface Report {
  period_days: number
  generated_at: string
  totals: { received: number; resolved: number; escalated: number; currently_overdue: number }
  by_team: Record<string, number>
  by_category: Record<string, number>
  overdue: { id: number; title: string; team: string | null; priority: string; due_at: string }[]
  highlights: string[]
  narrative: string
}
