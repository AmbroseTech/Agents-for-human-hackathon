import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Cpu, Save } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api/client'
import type { Priority, Settings } from '../api/types'
import { Card, ErrorBox, PageHeader, Spinner } from '../components/ui'
import { label } from '../lib/format'

const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low']

export default function SettingsPage() {
  const q = useQuery({ queryKey: ['settings'], queryFn: api.settings })
  if (q.isError) return <ErrorBox error={q.error} />
  if (!q.data) return <Spinner />
  return <SettingsForm initial={q.data} />
}

function SettingsForm({ initial }: { initial: Settings }) {
  const qc = useQueryClient()
  const health = useQuery({ queryKey: ['health'], queryFn: api.health })
  const [draft, setDraft] = useState<Settings>(initial)
  const save = useMutation({
    mutationFn: async () => {
      for (const key of ['organization', 'autonomy', 'sla_hours', 'followup'] as const) {
        await api.updateSetting(key, draft[key] as Record<string, unknown>)
      }
    },
    onSuccess: () => qc.invalidateQueries(),
  })
  const s = draft
  const num = (v: string) => Math.max(1, Number(v) || 1)

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Decide how much the agent may do on its own and how quickly it should chase things."
        actions={
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4" />{' '}
            {save.isPending ? 'Saving…' : save.isSuccess ? 'Saved' : 'Save changes'}
          </button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Organization">
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="org-name">
                Name
              </label>
              <input
                id="org-name"
                className="input"
                value={s.organization.name}
                onChange={(e) =>
                  setDraft({ ...s, organization: { ...s.organization, name: e.target.value } })
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="org-type">
                  Type
                </label>
                <select
                  id="org-type"
                  className="input"
                  value={s.organization.type}
                  onChange={(e) =>
                    setDraft({ ...s, organization: { ...s.organization, type: e.target.value } })
                  }
                >
                  {['school', 'community_centre', 'library', 'nonprofit', 'local_initiative', 'other'].map(
                    (t) => (
                      <option key={t} value={t}>
                        {label(t)}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="org-tz">
                  Timezone
                </label>
                <input
                  id="org-tz"
                  className="input"
                  value={s.organization.timezone}
                  onChange={(e) =>
                    setDraft({ ...s, organization: { ...s.organization, timezone: e.target.value } })
                  }
                />
              </div>
            </div>
          </div>
        </Card>

        <Card title="Autonomy & approvals">
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="threshold">
                Ask a human before actions rated…
              </label>
              <select
                id="threshold"
                className="input"
                value={s.autonomy.approval_threshold}
                onChange={(e) =>
                  setDraft({
                    ...s,
                    autonomy: {
                      ...s.autonomy,
                      approval_threshold: e.target.value as Settings['autonomy']['approval_threshold'],
                    },
                  })
                }
              >
                <option value="high">High risk only (escalations, resolutions)</option>
                <option value="medium">Medium and above (also outgoing notifications)</option>
                <option value="low">Everything (review every action)</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Classification, assignment and task creation are always low-risk and reversible.
              </p>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
                checked={s.autonomy.auto_send_requester_updates}
                onChange={(e) =>
                  setDraft({
                    ...s,
                    autonomy: { ...s.autonomy, auto_send_requester_updates: e.target.checked },
                  })
                }
              />
              Let the agent send acknowledgements to requesters automatically
            </label>
          </div>
        </Card>

        <Card title="Service levels (hours until overdue)">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PRIORITIES.map((p) => (
              <div key={p}>
                <label className="label" htmlFor={`sla-${p}`}>
                  {label(p)}
                </label>
                <input
                  id={`sla-${p}`}
                  type="number"
                  min={1}
                  className="input"
                  value={s.sla_hours[p]}
                  onChange={(e) =>
                    setDraft({ ...s, sla_hours: { ...s.sla_hours, [p]: num(e.target.value) } })
                  }
                />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Follow-up & escalation">
          <p className="mb-3 text-xs text-slate-500">
            Hours after assignment before the agent checks progress.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PRIORITIES.map((p) => (
              <div key={p}>
                <label className="label" htmlFor={`fu-${p}`}>
                  {label(p)}
                </label>
                <input
                  id={`fu-${p}`}
                  type="number"
                  min={1}
                  className="input"
                  value={s.followup.check_after_hours[p]}
                  onChange={(e) =>
                    setDraft({
                      ...s,
                      followup: {
                        ...s.followup,
                        check_after_hours: { ...s.followup.check_after_hours, [p]: num(e.target.value) },
                      },
                    })
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <label className="label" htmlFor="esc">
              Escalate overdue work to
            </label>
            <input
              id="esc"
              className="input"
              value={s.followup.escalate_to ?? ''}
              onChange={(e) => setDraft({ ...s, followup: { ...s.followup, escalate_to: e.target.value } })}
            />
          </div>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-brand-600" /> Agent runtime
            </span>
          }
          className="lg:col-span-2"
        >
          {health.data ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">SDK</dt>
                <dd className="font-medium">{health.data.agent.sdk}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Model provider</dt>
                <dd className="font-medium">
                  {health.data.agent.provider === 'bedrock'
                    ? 'Amazon Bedrock'
                    : 'Offline deterministic policy (no AWS credentials)'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Model</dt>
                <dd className="font-medium">{health.data.agent.model}</dd>
              </div>
            </dl>
          ) : (
            <Spinner />
          )}
          <p className="mt-3 text-xs text-slate-500">
            Set <code>MODEL_PROVIDER=bedrock</code> and AWS credentials in the backend environment to use
            Bedrock. Without them CivicFlow runs the same tools with a built-in rules policy so demos stay
            reproducible.
          </p>
        </Card>
      </div>
    </>
  )
}
