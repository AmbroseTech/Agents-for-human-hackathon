import { format, formatDistanceToNow, parseISO } from 'date-fns'

const asDate = (iso: string) => parseISO(iso.endsWith('Z') ? iso : `${iso}Z`)

export const relative = (iso: string) => formatDistanceToNow(asDate(iso), { addSuffix: true })
export const short = (iso: string) => format(asDate(iso), 'd MMM, HH:mm')
export const timeOnly = (iso: string) => format(asDate(iso), 'HH:mm:ss')

export const label = (s: string | null | undefined) =>
  (s ?? 'unset').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export const ACTION_LABELS: Record<string, string> = {
  search_community_knowledge: 'Searched community knowledge',
  classify_request: 'Classified request',
  set_priority: 'Set priority',
  extract_details: 'Extracted details',
  assign_request: 'Assigned to team',
  create_task: 'Created task',
  update_task: 'Updated task',
  get_task_status: 'Checked task progress',
  draft_response: 'Drafted requester reply',
  send_notification: 'Sent notification',
  schedule_followup: 'Scheduled follow-up',
  escalate_request: 'Escalation',
  resolve_request: 'Resolved request',
  record_decision: 'Recorded decision summary',
  get_dashboard_metrics: 'Read dashboard metrics',
  generate_report: 'Generated report',
  approval_granted: 'Human approved action',
  approval_rejected: 'Human rejected action',
  simulate_time: 'Demo: fast-forwarded time',
  agent_error: 'Agent error',
}

export const actionLabel = (a: string) => ACTION_LABELS[a] ?? label(a)

export const priorityClass: Record<string, string> = {
  urgent: 'bg-rose-100 text-rose-800 ring-rose-200',
  high: 'bg-orange-100 text-orange-800 ring-orange-200',
  medium: 'bg-amber-100 text-amber-800 ring-amber-200',
  low: 'bg-slate-100 text-slate-700 ring-slate-200',
}

export const statusClass: Record<string, string> = {
  new: 'bg-sky-100 text-sky-800 ring-sky-200',
  triaged: 'bg-sky-100 text-sky-800 ring-sky-200',
  assigned: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  in_progress: 'bg-violet-100 text-violet-800 ring-violet-200',
  awaiting_approval: 'bg-amber-100 text-amber-900 ring-amber-200',
  escalated: 'bg-rose-100 text-rose-800 ring-rose-200',
  resolved: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  closed: 'bg-slate-100 text-slate-700 ring-slate-200',
}

export const CATEGORY_COLORS: Record<string, string> = {
  maintenance: '#f97316',
  it_support: '#0ea5e9',
  event: '#a855f7',
  volunteer: '#22c55e',
  donation: '#eab308',
  library: '#14b8a6',
  complaint: '#ef4444',
  question: '#64748b',
  safety: '#dc2626',
  other: '#94a3b8',
  unclassified: '#cbd5e1',
}
