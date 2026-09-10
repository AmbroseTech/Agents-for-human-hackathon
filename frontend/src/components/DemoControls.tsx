import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FlaskConical, Play, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { Card } from './ui'

export default function DemoControls() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity })
  const invalidate = () => qc.invalidateQueries()
  const demo = useMutation({
    mutationFn: api.createDemo,
    onSuccess: (d) => {
      invalidate()
      nav(`/app/requests/${d.id}`)
    },
  })
  const monitor = useMutation({ mutationFn: api.runMonitor, onSuccess: invalidate })
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-brand-600" aria-hidden /> Demo scenarios
        </span>
      }
      actions={
        <button
          className="btn-secondary px-3! py-1.5! text-xs"
          onClick={() => monitor.mutate()}
          disabled={monitor.isPending}
        >
          <RefreshCw className={monitor.isPending ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} aria-hidden />
          Run monitor cycle
        </button>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        Send a realistic sample request through the agent. Each one is processed live — nothing is
        pre-recorded.
      </p>
      <div className="flex flex-wrap gap-2">
        {meta.data?.scenarios.map((s) => (
          <button
            key={s.key}
            className="btn-secondary px-3! py-1.5! text-xs"
            disabled={demo.isPending}
            onClick={() => demo.mutate(s.key)}
            title={s.title}
          >
            <Play className="h-3.5 w-3.5" aria-hidden /> {s.label}
          </button>
        ))}
      </div>
      {demo.isPending && <p className="mt-3 text-xs text-brand-700">Agent is processing the request…</p>}
      {demo.isError && <p className="mt-3 text-xs text-rose-600">Could not create the demo request.</p>}
      {monitor.isSuccess && (
        <p className="mt-3 text-xs text-slate-500">
          Monitor ran: {String((monitor.data as { followups_run?: number }).followups_run ?? 0)} follow-up(s)
          executed, {String((monitor.data as { requests_checked?: number }).requests_checked ?? 0)} open
          request(s) checked.
        </p>
      )}
    </Card>
  )
}
