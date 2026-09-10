import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  Activity,
  BarChart3,
  BookOpen,
  CheckSquare,
  Inbox,
  LayoutDashboard,
  Menu,
  Settings as SettingsIcon,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { api } from '../api/client'

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/requests', label: 'Requests', icon: Inbox },
  { to: '/app/approvals', label: 'Approvals', icon: CheckSquare },
  { to: '/app/activity', label: 'Agent Activity', icon: Activity },
  { to: '/app/knowledge', label: 'Knowledge Base', icon: BookOpen },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/app/settings', label: 'Settings', icon: SettingsIcon },
]

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2">
      <img src="/civicflow.svg" alt="" className="h-8 w-8" />
      <span className={clsx('text-lg font-semibold tracking-tight', dark ? 'text-white' : 'text-slate-900')}>
        CivicFlow <span className="text-brand-600">AI</span>
      </span>
    </Link>
  )
}

export function AgentStatus() {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 15_000, retry: 1 })
  const approvals = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => api.approvals('pending'),
    refetchInterval: 10_000,
  })
  const online = health.isSuccess
  return (
    <div className="flex items-center gap-3 text-xs">
      <span
        className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-slate-700"
        title={health.data?.agent.model}
      >
        <span
          className={clsx('h-2 w-2 rounded-full', online ? 'live-dot bg-emerald-500' : 'bg-rose-500')}
          aria-hidden
        />
        {online
          ? `Agent online · ${health.data?.agent.provider === 'bedrock' ? 'Bedrock' : 'offline policy'}`
          : 'Agent unreachable'}
      </span>
      {(approvals.data?.length ?? 0) > 0 && (
        <Link
          to="/app/approvals"
          className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-900 hover:bg-amber-200"
        >
          {approvals.data!.length} approval{approvals.data!.length === 1 ? '' : 's'} waiting
        </Link>
      )}
    </div>
  )
}

export default function AppShell() {
  const [open, setOpen] = useState(false)
  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
              isActive
                ? 'bg-brand-50 text-brand-800'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )
          }
        >
          <Icon className="h-4 w-4" aria-hidden /> {label}
        </NavLink>
      ))}
    </nav>
  )
  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-5 lg:flex">
        <Logo />
        <div className="mt-8 flex-1">{nav}</div>
        <p className="text-xs text-slate-400">
          Built on Strands Agents SDK · AWS Agents for Humans Hackathon
        </p>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <Logo />
              <button className="btn-ghost p-2" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6">{nav}</div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <button className="btn-ghost p-2" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <Logo />
          </div>
          <div className="ml-auto">
            <AgentStatus />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
