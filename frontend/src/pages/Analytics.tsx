import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { CategoryDonut, CountBars } from '../components/charts'
import { Card, Empty, ErrorBox, PageHeader, PriorityBadge, Spinner, Stat } from '../components/ui'
import { short } from '../lib/format'

export default function Analytics() {
  const [days, setDays] = useState(7)
  const metrics = useQuery({ queryKey: ['metrics'], queryFn: api.metrics })
  const report = useQuery({ queryKey: ['report', days], queryFn: () => api.report(days) })

  if (metrics.isError) return <ErrorBox error={metrics.error} />
  if (!metrics.data) return <Spinner />
  const m = metrics.data

  return (
    <>
      <PageHeader
        title="Analytics & reports"
        subtitle={
          m.impact.is_demo
            ? 'Trends across all requests. Includes seeded demo data.'
            : 'Trends across all requests.'
        }
        actions={
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Report period
            <select className="input w-auto!" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[7, 14, 30, 90].map((d) => (
                <option key={d} value={d}>
                  Last {d} days
                </option>
              ))}
            </select>
          </label>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total requests" value={m.total_requests} />
        <Stat
          label="Avg. resolution time"
          value={m.avg_resolution_hours != null ? `${m.avg_resolution_hours}h` : '—'}
        />
        <Stat label="Agent actions" value={m.agent_actions} hint="Tool calls recorded" />
        <Stat
          label="Auto-routed"
          value={`${m.impact.auto_routed_pct}%`}
          hint="Assigned without human input"
          tone="good"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="By category">
          <CategoryDonut data={m.requests_by_category} />
        </Card>
        <Card title="By status">
          <CountBars data={m.requests_by_status} />
        </Card>
        <Card title="Open by priority">
          <CountBars data={m.open_by_priority} color="#f97316" />
        </Card>
      </div>

      <Card
        className="mt-6"
        title={
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-brand-600" /> Agent-generated summary
          </span>
        }
      >
        {report.isError ? (
          <ErrorBox error={report.error} />
        ) : !report.data ? (
          <Spinner label="Agent is compiling the report…" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {report.data.narrative}
              </p>
              <ul className="mt-4 space-y-1.5">
                {report.data.highlights.map((h, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden /> {h}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[11px] text-slate-400">
                Generated {short(report.data.generated_at)} for the last {report.data.period_days} days.
              </p>
            </div>
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(report.data.totals).map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-slate-50 p-3">
                    <dt className="text-xs text-slate-500">{k.replace(/_/g, ' ')}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Workload by team
                </h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {Object.entries(report.data.by_team).map(([t, n]) => (
                    <li key={t} className="flex justify-between">
                      <span className="text-slate-700">{t}</span>
                      <span className="tabular-nums font-medium">{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Currently overdue
                </h3>
                {report.data.overdue.length ? (
                  <ul className="mt-2 space-y-2 text-sm">
                    {report.data.overdue.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-2">
                        <Link
                          to={`/app/requests/${o.id}`}
                          className="truncate text-brand-700 hover:underline"
                        >
                          {o.title}
                        </Link>
                        <PriorityBadge priority={o.priority} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>None.</Empty>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>
    </>
  )
}
