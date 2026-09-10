import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import RequestTable from '../components/RequestTable'
import { Card, ErrorBox, PageHeader, Spinner } from '../components/ui'
import { label } from '../lib/format'

export default function Requests() {
  const [filters, setFilters] = useState({ status: '', category: '', priority: '', q: '' })
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity })
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
  const requests = useQuery({
    queryKey: ['requests', params],
    queryFn: () => api.requests(params),
    refetchInterval: 10_000,
  })
  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters((f) => ({ ...f, [k]: e.target.value }))

  return (
    <>
      <PageHeader
        title="Requests"
        subtitle="Every request the organization has received, with the agent's classification and routing."
        actions={
          <Link to="/app/requests/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New request
          </Link>
        }
      />
      <Card>
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <label className="relative md:col-span-1">
            <span className="sr-only">Search</span>
            <Search
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
              aria-hidden
            />
            <input className="input pl-9" placeholder="Search…" value={filters.q} onChange={set('q')} />
          </label>
          {(['status', 'category', 'priority'] as const).map((k) => (
            <label key={k}>
              <span className="sr-only">{label(k)}</span>
              <select className="input" value={filters[k]} onChange={set(k)}>
                <option value="">
                  All {k === 'status' ? 'statuses' : k === 'category' ? 'categories' : 'priorities'}
                </option>
                {(k === 'status'
                  ? meta.data?.statuses
                  : k === 'category'
                    ? meta.data?.categories
                    : meta.data?.priorities
                )?.map((v) => (
                  <option key={v} value={v}>
                    {label(v)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {requests.isError ? (
          <ErrorBox error={requests.error} />
        ) : requests.data ? (
          <RequestTable rows={requests.data} />
        ) : (
          <Spinner />
        )}
      </Card>
    </>
  )
}
