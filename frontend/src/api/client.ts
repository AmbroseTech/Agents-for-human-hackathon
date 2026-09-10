import axios from 'axios'
import type {
  AgentEvent,
  Approval,
  Health,
  KnowledgeItem,
  Meta,
  Metrics,
  Report,
  RequestDetail,
  RequestSummary,
  Settings,
  Task,
  Team,
} from './types'

export const http = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api', timeout: 60_000 })

export interface NewRequest {
  title: string
  description: string
  requester_name: string
  requester_contact?: string
  channel: string
}

export interface KnowledgeInput {
  title: string
  category: string
  content: string
  tags: string[]
}

export interface Decision {
  decision: 'approve' | 'reject' | 'modify'
  decided_by?: string
  note?: string
  modified_action?: Record<string, string>
}

export const api = {
  health: () => http.get<Health>('/health').then((r) => r.data),
  meta: () => http.get<Meta>('/meta').then((r) => r.data),
  metrics: () => http.get<Metrics>('/metrics').then((r) => r.data),
  report: (days: number) =>
    http.get<Report>('/reports/summary', { params: { period_days: days } }).then((r) => r.data),
  settings: () => http.get<Settings>('/settings').then((r) => r.data),
  updateSetting: (key: string, value: Record<string, unknown>) =>
    http.put(`/settings/${key}`, { value }).then((r) => r.data),

  requests: (params?: Record<string, string | undefined>) =>
    http.get<RequestSummary[]>('/requests', { params }).then((r) => r.data),
  request: (id: number) => http.get<RequestDetail>(`/requests/${id}`).then((r) => r.data),
  createRequest: (body: NewRequest) => http.post<RequestDetail>('/requests', body).then((r) => r.data),
  createDemo: (key: string) => http.post<RequestDetail>(`/requests/demo/${key}`).then((r) => r.data),
  followup: (id: number) => http.post<RequestDetail>(`/requests/${id}/followup`).then((r) => r.data),
  simulateTime: (id: number, hours: number) =>
    http
      .post<RequestDetail>(`/requests/${id}/simulate-time`, null, { params: { hours } })
      .then((r) => r.data),
  resolve: (id: number, outcome: string) =>
    http.post<RequestDetail>(`/requests/${id}/resolve`, { outcome }).then((r) => r.data),
  updateTask: (id: number, status: Task['status'], note: string) =>
    http.patch<Task>(`/tasks/${id}`, { status, note }).then((r) => r.data),

  approvals: (status?: string) =>
    http.get<Approval[]>('/approvals', { params: { status: status ?? '' } }).then((r) => r.data),
  decide: (id: number, body: Decision) =>
    http.post<Approval>(`/approvals/${id}/decide`, body).then((r) => r.data),

  activity: (limit = 100) => http.get<AgentEvent[]>('/activity', { params: { limit } }).then((r) => r.data),
  runMonitor: () => http.post('/monitor/run').then((r) => r.data),

  knowledge: (q?: string) =>
    http.get<KnowledgeItem[]>('/knowledge', { params: q ? { q } : {} }).then((r) => r.data),
  addKnowledge: (body: KnowledgeInput) => http.post<KnowledgeItem>('/knowledge', body).then((r) => r.data),
  editKnowledge: (id: number, body: KnowledgeInput) =>
    http.put<KnowledgeItem>(`/knowledge/${id}`, body).then((r) => r.data),
  deleteKnowledge: (id: number) => http.delete(`/knowledge/${id}`),
  teams: () => http.get<Team[]>('/teams').then((r) => r.data),
}
