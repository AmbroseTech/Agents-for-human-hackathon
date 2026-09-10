import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ShieldAlert, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Approval } from '../api/types'
import { actionLabel, label, relative } from '../lib/format'
import { Badge } from './ui'

const riskClass: Record<string, string> = {
  high: 'bg-rose-100 text-rose-800 ring-rose-200',
  medium: 'bg-amber-100 text-amber-800 ring-amber-200',
  low: 'bg-slate-100 text-slate-700 ring-slate-200',
}

export default function ApprovalCard({
  approval: a,
  showRequest = false,
}: {
  approval: Approval
  showRequest?: boolean
}) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const decide = useMutation({
    mutationFn: (decision: 'approve' | 'reject') => api.decide(a.id, { decision, note: note || undefined }),
    onSuccess: () => qc.invalidateQueries(),
  })
  const pending = a.status === 'pending'

  return (
    <article
      className={pending ? 'rounded-2xl border border-amber-300 bg-amber-50 p-4' : 'card p-4 opacity-80'}
      aria-label={`Approval ${a.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-700" aria-hidden />
          <h3 className="font-medium text-slate-900">{actionLabel(a.action)}</h3>
          <Badge className={riskClass[a.risk]}>{label(a.risk)} risk</Badge>
          {!pending && <Badge>{label(a.status)}</Badge>}
        </div>
        <span className="text-xs text-slate-500">{relative(a.created_at)}</span>
      </div>
      {showRequest && (
        <Link
          to={`/app/requests/${a.request_id}`}
          className="mt-1 block text-xs text-brand-700 hover:underline"
        >
          {a.request_title ?? `Request #${a.request_id}`}
        </Link>
      )}
      <p className="mt-3 text-sm font-medium text-slate-800">Agent recommends: {a.recommendation}</p>
      <p className="mt-1 text-sm text-slate-600">
        <span className="font-medium text-slate-700">Why:</span> {a.reason}
      </p>
      {Object.keys(a.proposed_action).length > 0 && (
        <dl className="mt-3 grid gap-1 rounded-xl bg-white/70 p-3 text-xs sm:grid-cols-2">
          {Object.entries(a.proposed_action).map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-slate-500">{label(k)}</dt>
              <dd className="truncate text-slate-800" title={String(v)}>
                {String(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {pending ? (
        <div className="mt-4 space-y-2">
          <input
            className="input"
            placeholder="Optional note for the audit log"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="btn-primary"
              onClick={() => decide.mutate('approve')}
              disabled={decide.isPending}
            >
              <Check className="h-4 w-4" /> Approve
            </button>
            <button
              className="btn-danger"
              onClick={() => decide.mutate('reject')}
              disabled={decide.isPending}
            >
              <X className="h-4 w-4" /> Reject
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          {label(a.status)} by {a.decided_by ?? 'unknown'}
          {a.decided_at ? ` ${relative(a.decided_at)}` : ''}
          {a.decision_note ? ` — “${a.decision_note}”` : ''}
        </p>
      )}
    </article>
  )
}
