import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Send, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type NewRequest as NewRequestBody } from '../api/client'
import { Card, PageHeader } from '../components/ui'

const CHANNELS = ['web_form', 'email', 'whatsapp', 'phone', 'walk_in', 'other']

export default function NewRequest() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity })
  const [form, setForm] = useState<NewRequestBody>({
    title: '',
    description: '',
    requester_name: '',
    requester_contact: '',
    channel: 'web_form',
  })
  const create = useMutation({
    mutationFn: api.createRequest,
    onSuccess: (d) => {
      qc.invalidateQueries()
      nav(`/app/requests/${d.id}`)
    },
  })
  const bind = (k: keyof NewRequestBody) => ({
    value: form[k] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
  })
  const fill = (key: string) => {
    const s = meta.data?.scenarios.find((x) => x.key === key)
    if (s)
      setForm({
        title: s.title,
        description: s.description,
        requester_name: s.requester_name,
        requester_contact: s.requester_contact,
        channel: s.channel,
      })
  }
  const valid = form.title.trim().length >= 3 && form.description.trim().length >= 10

  return (
    <>
      <PageHeader
        title="Submit a request"
        subtitle="Describe what you need in plain language. The agent will classify it, pick the right team, create a task and reply."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              create.mutate({ ...form, requester_contact: form.requester_contact || undefined })
            }}
          >
            <div>
              <label className="label" htmlFor="title">
                Subject
              </label>
              <input
                id="title"
                className="input"
                required
                minLength={3}
                maxLength={200}
                placeholder="e.g. Broken heater in the community hall"
                {...bind('title')}
              />
            </div>
            <div>
              <label className="label" htmlFor="description">
                Details
              </label>
              <textarea
                id="description"
                className="input min-h-40"
                required
                minLength={10}
                maxLength={5000}
                placeholder="What happened, where, who is affected, and by when do you need it?"
                {...bind('description')}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="name">
                  Your name
                </label>
                <input
                  id="name"
                  className="input"
                  maxLength={120}
                  placeholder="Optional"
                  {...bind('requester_name')}
                />
              </div>
              <div>
                <label className="label" htmlFor="contact">
                  Contact
                </label>
                <input
                  id="contact"
                  className="input"
                  maxLength={200}
                  placeholder="email or phone (optional)"
                  {...bind('requester_contact')}
                />
              </div>
              <div>
                <label className="label" htmlFor="channel">
                  Channel
                </label>
                <select id="channel" className="input" {...bind('channel')}>
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {c.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {create.isError && (
              <p className="text-sm text-rose-600">
                Submission failed. Please check the fields and try again.
              </p>
            )}
            <div className="flex items-center justify-end gap-3">
              <button type="submit" className="btn-primary" disabled={!valid || create.isPending}>
                <Send className="h-4 w-4" /> {create.isPending ? 'Agent is working…' : 'Send to CivicFlow'}
              </button>
            </div>
          </form>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-600" /> Try a sample
            </span>
          }
        >
          <p className="mb-3 text-xs text-slate-500">
            Prefill the form with a realistic scenario, edit it, then submit.
          </p>
          <ul className="space-y-2">
            {meta.data?.scenarios.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  className="w-full rounded-xl border border-slate-200 p-3 text-left text-sm hover:border-brand-300 hover:bg-brand-50"
                  onClick={() => fill(s.key)}
                >
                  <div className="font-medium text-slate-800">{s.label}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{s.title}</div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
