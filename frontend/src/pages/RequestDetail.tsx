import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Clock, FastForward, Mail, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Task } from '../api/types'
import ApprovalCard from '../components/ApprovalCard'
import Timeline from '../components/Timeline'
import {
  Badge,
  Card,
  CategoryBadge,
  Empty,
  ErrorBox,
  OverdueBadge,
  PriorityBadge,
  Spinner,
  StatusBadge,
} from '../components/ui'
import { label, relative, short } from '../lib/format'

const TASK_STATUSES: Task['status'][] = ['open', 'in_progress', 'blocked', 'done']

export default function RequestDetail() {
  const id = Number(useParams().id)
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['request', id], queryFn: () => api.request(id), refetchInterval: 8_000 })
  const refresh = () => qc.invalidateQueries()
  const followup = useMutation({ mutationFn: () => api.followup(id), onSuccess: refresh })
  const simulate = useMutation({ mutationFn: (h: number) => api.simulateTime(id, h), onSuccess: refresh })
  const resolve = useMutation({ mutationFn: (o: string) => api.resolve(id, o), onSuccess: refresh })
  const task = useMutation({
    mutationFn: ({ tid, status, note }: { tid: number; status: Task['status']; note: string }) =>
      api.updateTask(tid, status, note),
    onSuccess: refresh,
  })
  const [outcome, setOutcome] = useState('')
  const [tab, setTab] = useState<'timeline' | 'notifications'>('timeline')

  if (q.isError) return <ErrorBox error={q.error} />
  if (!q.data) return <Spinner label="Loading request…" />
  const r = q.data
  const isOpen = !['resolved', 'closed'].includes(r.status)
  const pending = r.approvals.filter((a) => a.status === 'pending')
  const busy = followup.isPending || simulate.isPending || resolve.isPending

  return (
    <>
      <Link
        to="/app/requests"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> All requests
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            <PriorityBadge priority={r.priority} />
            <CategoryBadge category={r.category} />
            {r.overdue && <OverdueBadge />}
            {r.escalated && <Badge className="bg-rose-100 text-rose-800 ring-rose-200">Escalated</Badge>}
            {r.is_demo && <Badge>Demo</Badge>}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{r.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            From {r.requester_name}
            {r.requester_contact ? ` (${r.requester_contact})` : ''} via {label(r.channel)} ·{' '}
            {relative(r.created_at)}
            {r.due_at && (
              <>
                {' '}
                · <Clock className="inline h-3.5 w-3.5" aria-hidden /> due {short(r.due_at)}
              </>
            )}
          </p>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="mb-6 space-y-3">
          {pending.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Request">
            <p className="whitespace-pre-wrap text-sm text-slate-700">{r.description}</p>
          </Card>

          <Card title="Agent's understanding">
            {r.summary ? (
              <p className="text-sm text-slate-800">{r.summary}</p>
            ) : (
              <Empty>Not yet analysed.</Empty>
            )}
            {Object.keys(r.extracted).length > 0 && (
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {Object.entries(r.extracted).map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-slate-50 p-3">
                    <dt className="text-xs uppercase tracking-wide text-slate-500">{label(k)}</dt>
                    <dd className="mt-0.5 text-sm text-slate-800">{v || '—'}</dd>
                  </div>
                ))}
              </dl>
            )}
            {r.reasoning.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Decision summary
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {r.reasoning.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-700">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                      <span>
                        <span className="font-medium text-slate-900">{label(s.step)}:</span> {s.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card
            title={
              <div className="flex gap-1" role="tablist">
                {(['timeline', 'notifications'] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    className={
                      tab === t
                        ? 'rounded-lg bg-brand-50 px-3 py-1 text-brand-800'
                        : 'rounded-lg px-3 py-1 text-slate-500 hover:bg-slate-100'
                    }
                    onClick={() => setTab(t)}
                  >
                    {t === 'timeline'
                      ? `Agent timeline (${r.events.length})`
                      : `Messages sent (${r.notifications.length})`}
                  </button>
                ))}
              </div>
            }
          >
            {tab === 'timeline' ? (
              <Timeline events={r.events} />
            ) : r.notifications.length ? (
              <ul className="space-y-3">
                {r.notifications.map((n) => (
                  <li key={n.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" aria-hidden /> To {n.recipient} via {label(n.channel)}
                      </span>
                      <span>
                        {label(n.status)} · {relative(n.created_at)}
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-medium text-slate-900">{n.subject}</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{n.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No messages sent yet.</Empty>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Assignment">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Team</dt>
                <dd className="font-medium text-slate-900">{r.assigned_team ?? 'Unassigned'}</dd>
              </div>
              {r.outcome && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Outcome</dt>
                  <dd className="text-slate-800">{r.outcome}</dd>
                </div>
              )}
            </dl>
            {r.tasks.length ? (
              <ul className="mt-4 space-y-3">
                {r.tasks.map((t) => (
                  <li key={t.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="text-sm font-medium text-slate-900">{t.title}</div>
                    {t.details && <p className="mt-1 text-xs text-slate-600">{t.details}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{t.team}</span>
                      {t.due_at && <span>· due {short(t.due_at)}</span>}
                    </div>
                    {isOpen && (
                      <label className="mt-2 block text-xs">
                        <span className="sr-only">Task status</span>
                        <select
                          className="input py-1! text-xs"
                          value={t.status}
                          onChange={(e) =>
                            task.mutate({
                              tid: t.id,
                              status: e.target.value as Task['status'],
                              note: `Status set to ${e.target.value} from the dashboard`,
                            })
                          }
                        >
                          {TASK_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {label(s)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {!isOpen && <Badge className="mt-2">{label(t.status)}</Badge>}
                    {t.last_update_note && (
                      <p className="mt-1 text-[11px] text-slate-400">{t.last_update_note}</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No tasks created.</Empty>
            )}
          </Card>

          <Card title="Follow-ups">
            {r.followups.length ? (
              <ul className="space-y-2 text-sm">
                {r.followups.map((f) => (
                  <li key={f.id} className="flex items-start gap-2">
                    <Clock
                      className={
                        f.status === 'done'
                          ? 'mt-0.5 h-4 w-4 text-emerald-600'
                          : 'mt-0.5 h-4 w-4 text-slate-400'
                      }
                      aria-hidden
                    />
                    <div>
                      <div className="text-slate-800">{f.note}</div>
                      <div className="text-xs text-slate-500">
                        {label(f.status)} ·{' '}
                        {f.status === 'done' && f.completed_at
                          ? `done ${relative(f.completed_at)}`
                          : `due ${short(f.due_at)}`}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>None scheduled.</Empty>
            )}
          </Card>

          {r.response_draft && (
            <Card title="Reply to requester">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{r.response_draft}</p>
            </Card>
          )}

          {isOpen && (
            <Card title="Actions" className="border-dashed">
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={() => followup.mutate()} disabled={busy}>
                  <RefreshCw className={followup.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Run
                  follow-up now
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => simulate.mutate(48)}
                  disabled={busy}
                  title="Demo: pretend 48 hours have passed so SLA and follow-up checks fire"
                >
                  <FastForward className="h-4 w-4" /> Fast-forward 48h
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                Fast-forward is a demo helper; in production the monitor runs these checks automatically in
                the background.
              </p>
              <form
                className="mt-4 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  resolve.mutate(outcome)
                }}
              >
                <label className="label" htmlFor="outcome">
                  Mark resolved
                </label>
                <input
                  id="outcome"
                  className="input"
                  placeholder="What was done?"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  required
                  minLength={3}
                />
                <button className="btn-primary w-full" disabled={busy || outcome.trim().length < 3}>
                  <CheckCircle2 className="h-4 w-4" /> Resolve request
                </button>
              </form>
            </Card>
          )}

          {r.approvals.filter((a) => a.status !== 'pending').length > 0 && (
            <Card title="Past approvals">
              <div className="space-y-3">
                {r.approvals
                  .filter((a) => a.status !== 'pending')
                  .map((a) => (
                    <ApprovalCard key={a.id} approval={a} />
                  ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
