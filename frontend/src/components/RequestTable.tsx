import { Link } from 'react-router-dom'
import type { RequestSummary } from '../api/types'
import { relative } from '../lib/format'
import { CategoryBadge, Empty, OverdueBadge, PriorityBadge, StatusBadge } from './ui'

export default function RequestTable({
  rows,
  compact = false,
}: {
  rows: RequestSummary[]
  compact?: boolean
}) {
  if (!rows.length) return <Empty>No requests match.</Empty>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-2 pr-4 font-medium">Request</th>
            <th className="py-2 pr-4 font-medium">Category</th>
            <th className="py-2 pr-4 font-medium">Priority</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            {!compact && <th className="py-2 pr-4 font-medium">Team</th>}
            <th className="py-2 pr-4 font-medium">Received</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="max-w-md py-3 pr-4">
                <Link
                  to={`/app/requests/${r.id}`}
                  className="font-medium text-slate-900 hover:text-brand-700"
                >
                  {r.title}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{r.requester_name}</span>
                  {r.is_demo && (
                    <span className="rounded bg-slate-100 px-1.5 text-[10px] uppercase">demo</span>
                  )}
                  {r.overdue && <OverdueBadge />}
                  {r.pending_approvals > 0 && (
                    <span className="rounded bg-amber-100 px-1.5 text-[10px] font-medium uppercase text-amber-900">
                      approval needed
                    </span>
                  )}
                </div>
              </td>
              <td className="py-3 pr-4">
                <CategoryBadge category={r.category} />
              </td>
              <td className="py-3 pr-4">
                <PriorityBadge priority={r.priority} />
              </td>
              <td className="py-3 pr-4">
                <StatusBadge status={r.status} />
              </td>
              {!compact && <td className="py-3 pr-4 text-slate-600">{r.assigned_team ?? '—'}</td>}
              <td className="whitespace-nowrap py-3 pr-4 text-slate-500">{relative(r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
