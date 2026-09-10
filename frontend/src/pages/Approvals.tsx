import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import ApprovalCard from '../components/ApprovalCard'
import { Card, Empty, ErrorBox, PageHeader, Spinner } from '../components/ui'

export default function Approvals() {
  const [showHistory, setShowHistory] = useState(false)
  const pending = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => api.approvals('pending'),
    refetchInterval: 8_000,
  })
  const all = useQuery({
    queryKey: ['approvals', 'all'],
    queryFn: () => api.approvals(''),
    enabled: showHistory,
  })

  return (
    <>
      <PageHeader
        title="Approval queue"
        subtitle="High-impact actions the agent wants to take. It has already done the analysis — you make the call."
        actions={
          <button className="btn-secondary" onClick={() => setShowHistory((s) => !s)}>
            {showHistory ? 'Hide history' : 'Show history'}
          </button>
        }
      />
      {pending.isError ? (
        <ErrorBox error={pending.error} />
      ) : !pending.data ? (
        <Spinner />
      ) : pending.data.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {pending.data.map((a) => (
            <ApprovalCard key={a.id} approval={a} showRequest />
          ))}
        </div>
      ) : (
        <Card>
          <Empty>
            Nothing needs your decision right now. Try fast-forwarding a request and running a follow-up to
            see an escalation recommendation.
          </Empty>
        </Card>
      )}

      {showHistory && (
        <Card title="Decision history" className="mt-6">
          {all.data ? (
            all.data.filter((a) => a.status !== 'pending').length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {all.data
                  .filter((a) => a.status !== 'pending')
                  .map((a) => (
                    <ApprovalCard key={a.id} approval={a} showRequest />
                  ))}
              </div>
            ) : (
              <Empty>No decisions recorded yet.</Empty>
            )
          ) : (
            <Spinner />
          )}
        </Card>
      )}
    </>
  )
}
