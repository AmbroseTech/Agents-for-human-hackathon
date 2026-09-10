import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import Timeline from '../components/Timeline'
import { Card, ErrorBox, PageHeader, Spinner } from '../components/ui'

export default function Activity() {
  const q = useQuery({
    queryKey: ['activity', 200],
    queryFn: () => api.activity(200),
    refetchInterval: 6_000,
  })
  return (
    <>
      <PageHeader
        title="Agent activity log"
        subtitle="Every tool the agent has called, across all requests, with the reason it gave. Click an entry for the raw result."
      />
      <Card>
        {q.isError ? (
          <ErrorBox error={q.error} />
        ) : q.data ? (
          <Timeline
            events={q.data.map((e) => ({
              ...e,
              agent: e.request_title ? `${e.agent} · ${e.request_title}` : e.agent,
            }))}
          />
        ) : (
          <Spinner />
        )}
      </Card>
    </>
  )
}
