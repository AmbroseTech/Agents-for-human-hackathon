import clsx from 'clsx'
import { AlertTriangle, Bot, CheckCircle2, Search, Send, ShieldAlert, Timer, UserCheck } from 'lucide-react'
import { useState } from 'react'
import type { AgentEvent } from '../api/types'
import { actionLabel, short } from '../lib/format'
import { Empty } from './ui'

const ICONS: Record<string, typeof Bot> = {
  search_community_knowledge: Search,
  send_notification: Send,
  schedule_followup: Timer,
  escalate_request: ShieldAlert,
  resolve_request: CheckCircle2,
  approval_granted: UserCheck,
  approval_rejected: UserCheck,
  agent_error: AlertTriangle,
}

function Result({ result }: { result: Record<string, unknown> }) {
  const entries = Object.entries(result).filter(([k]) => !['ok', 'request_id', 'id'].includes(k))
  if (!entries.length) return null
  return (
    <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
      {entries.slice(0, 8).map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-slate-400">{k.replace(/_/g, ' ')}</dt>
          <dd className="truncate text-slate-700" title={typeof v === 'string' ? v : JSON.stringify(v)}>
            {typeof v === 'string' ? v : Array.isArray(v) ? `${v.length} item(s)` : JSON.stringify(v)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function Timeline({ events }: { events: AgentEvent[] }) {
  const [openId, setOpenId] = useState<number | null>(null)
  if (!events.length) return <Empty>The agent has not acted on this request yet.</Empty>
  return (
    <ol className="relative ml-3 border-l border-slate-200">
      {events.map((e) => {
        const Icon = ICONS[e.action] ?? Bot
        const human = e.action.startsWith('approval_')
        const open = openId === e.id
        return (
          <li key={e.id} className="relative pb-5 pl-6 last:pb-0">
            <span
              className={clsx(
                'absolute -left-[13px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white',
                e.action === 'agent_error'
                  ? 'bg-rose-100 text-rose-700'
                  : human
                    ? 'bg-emerald-100 text-emerald-700'
                    : e.requires_approval
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-brand-100 text-brand-700',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <button
              className="w-full text-left"
              onClick={() => setOpenId(open ? null : e.id)}
              aria-expanded={open}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-medium text-slate-900">
                  {actionLabel(e.action)}
                  {e.requires_approval && (
                    <span className="ml-2 text-xs font-normal text-amber-700">· awaiting approval</span>
                  )}
                </span>
                <span className="text-xs text-slate-400">
                  {short(e.timestamp)} · {human ? 'Human' : e.agent}
                  {e.confidence != null && ` · ${Math.round(e.confidence * 100)}%`}
                </span>
              </div>
              {e.reason && <p className="mt-0.5 text-sm text-slate-600">{e.reason}</p>}
            </button>
            {open && <Result result={e.result} />}
          </li>
        )
      })}
    </ol>
  )
}
