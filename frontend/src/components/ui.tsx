import clsx from 'clsx'
import type { ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { label, priorityClass, statusClass } from '../lib/format'

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx('badge', className ?? 'bg-slate-100 text-slate-700 ring-slate-200')}>
      {children}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: string | null }) {
  return <Badge className={priorityClass[priority ?? ''] ?? priorityClass.low}>{label(priority)}</Badge>
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge className={statusClass[status] ?? statusClass.closed}>{label(status)}</Badge>
}

export function CategoryBadge({ category }: { category: string | null }) {
  return (
    <Badge className="bg-brand-50 text-brand-800 ring-brand-200">{label(category ?? 'unclassified')}</Badge>
  )
}

export function OverdueBadge() {
  return (
    <Badge className="bg-rose-600 text-white ring-rose-600">
      <AlertTriangle className="mr-1 h-3 w-3" aria-hidden /> Overdue
    </Badge>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({
  title,
  children,
  className,
  actions,
}: {
  title?: ReactNode
  children: ReactNode
  className?: string
  actions?: ReactNode
}) {
  return (
    <section className={clsx('card p-5', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function Spinner({ label: text = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-slate-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {text}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
      {children}
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
      Something went wrong: {msg}. Is the backend running on port 8000?
    </div>
  )
}

export function Stat({
  label: text,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'default' | 'danger' | 'warn' | 'good'
}) {
  const tones = {
    default: 'text-slate-900',
    danger: 'text-rose-600',
    warn: 'text-amber-600',
    good: 'text-emerald-600',
  }
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{text}</div>
      <div className={clsx('mt-1 text-2xl font-semibold tabular-nums', tones[tone])}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  )
}
