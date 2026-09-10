import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { api, type KnowledgeInput } from '../api/client'
import type { KnowledgeItem } from '../api/types'
import { Badge, Card, Empty, ErrorBox, PageHeader, Spinner } from '../components/ui'
import { label } from '../lib/format'

const CATEGORIES = ['policy', 'procedure', 'faq', 'contact', 'hours', 'responsibility', 'guideline']
const blank: KnowledgeInput = { title: '', category: 'policy', content: '', tags: [] }

function Editor({
  initial,
  onClose,
}: {
  initial: (KnowledgeInput & { id?: number }) | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<KnowledgeInput>(initial ?? blank)
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '')
  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }
      return initial?.id ? api.editKnowledge(initial.id, body) : api.addKnowledge(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge'] })
      onClose()
    },
  })
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="k-title">
            Title
          </label>
          <input
            id="k-title"
            className="input"
            required
            minLength={3}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="k-cat">
            Type
          </label>
          <select
            id="k-cat"
            className="input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="k-content">
          Content
        </label>
        <textarea
          id="k-content"
          className="input min-h-32"
          required
          minLength={10}
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
        />
      </div>
      <div>
        <label className="label" htmlFor="k-tags">
          Tags (comma separated)
        </label>
        <input
          id="k-tags"
          className="input"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="lab, ict, exam"
        />
      </div>
      {save.isError && <p className="text-sm text-rose-600">Could not save.</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" disabled={save.isPending}>
          {initial?.id ? 'Save changes' : 'Add to knowledge base'}
        </button>
      </div>
    </form>
  )
}

export default function Knowledge() {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<(KnowledgeInput & { id?: number }) | null | undefined>(undefined)
  const items = useQuery({ queryKey: ['knowledge', q], queryFn: () => api.knowledge(q || undefined) })
  const teams = useQuery({ queryKey: ['teams'], queryFn: api.teams })
  const del = useMutation({
    mutationFn: api.deleteKnowledge,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
  })

  return (
    <>
      <PageHeader
        title="Community knowledge"
        subtitle="Policies, procedures, hours and responsibilities the agent consults before it assigns work or makes a promise. What's here is what it knows."
        actions={
          <button className="btn-primary" onClick={() => setEditing(null)}>
            <Plus className="h-4 w-4" /> Add entry
          </button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {editing !== undefined && (
            <Card title={editing?.id ? 'Edit entry' : 'New entry'}>
              <Editor initial={editing} onClose={() => setEditing(undefined)} />
            </Card>
          )}
          <Card>
            <label className="relative mb-4 block">
              <span className="sr-only">Search knowledge</span>
              <Search
                className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
                aria-hidden
              />
              <input
                className="input pl-9"
                placeholder="Search the way the agent does, e.g. 'computers stopped working exam'"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            {items.isError ? (
              <ErrorBox error={items.error} />
            ) : !items.data ? (
              <Spinner />
            ) : items.data.length ? (
              <ul className="divide-y divide-slate-100">
                {items.data.map((k: KnowledgeItem) => (
                  <li key={k.id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-brand-600" aria-hidden />
                        <h3 className="font-medium text-slate-900">{k.title}</h3>
                        <Badge>{label(k.category)}</Badge>
                      </div>
                      <div className="flex gap-1">
                        <button
                          className="btn-ghost p-1.5!"
                          aria-label="Edit"
                          onClick={() =>
                            setEditing({
                              id: k.id,
                              title: k.title,
                              category: k.category,
                              content: k.content,
                              tags: k.tags,
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="btn-ghost p-1.5! text-rose-600"
                          aria-label="Delete"
                          onClick={() => confirm(`Delete “${k.title}”?`) && del.mutate(k.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{k.content}</p>
                    {k.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {k.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>
                {q
                  ? 'No entries match — the agent would tell the requester it has no documented policy for this.'
                  : 'Knowledge base is empty.'}
              </Empty>
            )}
          </Card>
        </div>

        <Card
          title={
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-600" /> Teams & responsibilities
            </span>
          }
        >
          {teams.data ? (
            <ul className="space-y-3">
              {teams.data.map((t) => (
                <li key={t.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="font-medium text-slate-900">{t.name}</div>
                  <div className="mt-0.5 text-xs text-slate-600">{t.responsibilities}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {t.lead ? `${t.lead} · ` : ''}
                    {t.contact}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.categories.map((c) => (
                      <Badge key={c} className="bg-brand-50 text-brand-800 ring-brand-200">
                        {label(c)}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Spinner />
          )}
        </Card>
      </div>
    </>
  )
}
