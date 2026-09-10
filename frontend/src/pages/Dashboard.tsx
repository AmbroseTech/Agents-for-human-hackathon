import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { CategoryDonut, CountBars } from '../components/charts'
import DemoControls from '../components/DemoControls'
import RequestTable from '../components/RequestTable'
import { Card, Empty, ErrorBox, PageHeader, Spinner, Stat } from '../components/ui'
import { actionLabel, relative } from '../lib/format'

export default function Dashboard() {
  const metrics = useQuery({ queryKey: ['metrics'], queryFn: api.metrics, refetchInterval: 10_000 })
  const requests = useQuery({
    queryKey: ['requests', {}],
    queryFn: () => api.requests(),
    refetchInterval: 10_000,
  })
  const activity = useQuery({
    queryKey: ['activity', 12],
    queryFn: () => api.activity(12),
    refetchInterval: 8_000,
  })
  const approvals = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => api.approvals('pending'),
    refetchInterval: 10_000,
  })

  if (metrics.isError) return <ErrorBox error={metrics.error} />
  if (!metrics.data) return <Spinner />
  const m = metrics.data
  const overdue = (requests.data ?? []).filter((r) => r.overdue)

  return (
    <>
      <PageHeader
        title="Operations dashboard"
        subtitle={
          m.impact.is_demo
            ? 'Live view of everything the agent is handling. Figures include seeded demo requests.'
            : 'Live view of everything the agent is handling.'
        }
        actions={
          <Link to="/app/requests/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New request
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open requests" value={m.open_requests} hint={`${m.total_requests} total`} />
        <Stat
          label="Overdue"
          value={m.overdue_requests}
          tone={m.overdue_requests ? 'danger' : 'good'}
          hint="Past SLA"
        />
        <Stat
          label="Pending approvals"
          value={m.pending_approvals}
          tone={m.pending_approvals ? 'warn' : 'default'}
          hint="Need a human decision"
        />
        <Stat
          label="Resolved"
          value={m.resolved_requests}
          hint={
            m.avg_resolution_hours != null
              ? `avg ${m.avg_resolution_hours}h to resolve`
              : 'No resolutions yet'
          }
          tone="good"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <DemoControls />

          {overdue.length > 0 && (
            <Card title={<span className="text-rose-700">Needs attention — {overdue.length} overdue</span>}>
              <RequestTable rows={overdue.slice(0, 5)} compact />
            </Card>
          )}

          <Card
            title="Recent requests"
            actions={
              <Link to="/app/requests" className="text-xs font-medium text-brand-700 hover:underline">
                View all
              </Link>
            }
          >
            {requests.data ? <RequestTable rows={requests.data.slice(0, 8)} /> : <Spinner />}
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card title="Requests by category">
              <CategoryDonut data={m.requests_by_category} />
            </Card>
            <Card title="Requests by status">
              <CountBars data={m.requests_by_status} />
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          <Card title="Impact" className="bg-brand-900 border-brand-800! text-white">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-brand-200">Agent actions</dt>
                <dd className="text-2xl font-semibold">{m.agent_actions}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-200">Auto-routed</dt>
                <dd className="text-2xl font-semibold">{m.impact.auto_routed_pct}%</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-200">Hours saved (est.)</dt>
                <dd className="text-2xl font-semibold">{m.impact.hours_saved_estimate}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-200">High priority open</dt>
                <dd className="text-2xl font-semibold">{m.high_priority_requests}</dd>
              </div>
            </dl>
            <p className="mt-4 text-[11px] text-brand-200">
              {m.impact.is_demo ? 'Demo data. ' : ''}Estimate assumes ~45 min of manual coordination per
              request.
            </p>
          </Card>

          <Card
            title="Approvals waiting"
            actions={
              <Link to="/app/approvals" className="text-xs font-medium text-brand-700 hover:underline">
                Review
              </Link>
            }
          >
            {approvals.data?.length ? (
              <ul className="space-y-3">
                {approvals.data.slice(0, 4).map((a) => (
                  <li key={a.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                    <div className="font-medium text-amber-900">{a.recommendation}</div>
                    <div className="mt-1 text-xs text-amber-800/80">
                      <Link to={`/app/requests/${a.request_id}`} className="underline">
                        {a.request_title ?? `Request #${a.request_id}`}
                      </Link>{' '}
                      · {relative(a.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing waiting. The agent is operating within its autonomy limits.</Empty>
            )}
          </Card>

          <Card
            title="Agent activity"
            actions={
              <Link to="/app/activity" className="text-xs font-medium text-brand-700 hover:underline">
                Full log
              </Link>
            }
          >
            {activity.data?.length ? (
              <ol className="space-y-3 text-sm">
                {activity.data.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800">{actionLabel(e.action)}</div>
                      {e.reason && <div className="truncate text-xs text-slate-500">{e.reason}</div>}
                      <div className="text-[11px] text-slate-400">
                        {e.request_id ? (
                          <Link to={`/app/requests/${e.request_id}`} className="hover:underline">
                            {e.request_title ?? `#${e.request_id}`}
                          </Link>
                        ) : (
                          'system'
                        )}{' '}
                        · {relative(e.timestamp)}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>No activity yet.</Empty>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
