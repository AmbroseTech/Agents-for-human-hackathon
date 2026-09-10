import { ArrowRight, Bell, Brain, ClipboardList, Eye, Route, ShieldCheck, Timer, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/AppShell'

const STEPS = [
  ['Understand', 'Reads the request and pulls out who, what, where and when.', Brain],
  [
    'Classify & prioritise',
    'Maintenance, IT, events, volunteers, donations… with an SLA-backed priority.',
    ClipboardList,
  ],
  ['Plan & assign', 'Checks your own policies, picks the right team and creates a structured task.', Route],
  ['Notify', 'Drafts a grounded reply to the requester and briefs the team.', Bell],
  ['Follow up', 'Schedules check-ins and watches for stalled work.', Timer],
  [
    'Escalate — with approval',
    'Overdue? It recommends escalation and waits for a human to say yes.',
    ShieldCheck,
  ],
] as const

const AUDIENCES = [
  'Schools',
  'Community centres',
  'Libraries',
  'Nonprofits',
  'Local initiatives',
  'Volunteer groups',
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <a href="#how" className="btn-ghost hidden sm:inline-flex">
            How it works
          </a>
          <Link to="/app" className="btn-primary">
            Open the dashboard <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 lg:pt-20">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-200">
          AWS Agents for Humans Hackathon · Good Neighbor Agents
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          Let your community organization run the busywork itself.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-slate-600">
          CivicFlow AI turns incoming community requests into organized action — classifying, assigning,
          following up and escalating work while keeping humans in control.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/app/requests/new" className="btn-primary">
            Submit a request
          </Link>
          <Link to="/app" className="btn-secondary">
            See the agent at work
          </Link>
        </div>
        <ul className="mt-10 flex flex-wrap gap-2 text-sm text-slate-500">
          {AUDIENCES.map((a) => (
            <li key={a} className="rounded-full border border-slate-200 px-3 py-1">
              {a}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y border-slate-100 bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Not a chatbot. An operations agent.</h2>
            <p className="mt-3 text-slate-600">
              Small organizations receive requests through email, WhatsApp, phone calls and hallway
              conversations. Somebody then has to read each one, decide who owns it, create the task, chase
              progress and report back. CivicFlow does that work — with real tools that create tasks, send
              notifications, schedule follow-ups and detect overdue work — and records every decision so you
              can see exactly why it acted.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              [Eye, 'Transparent', 'Every step is logged with a short, readable reason.'],
              [ShieldCheck, 'Human in control', 'Sensitive actions become approvals, never surprises.'],
              [Users, 'Knows your org', 'Grounded in your own policies, teams and hours.'],
              [Timer, 'Never forgets', 'Follow-ups and overdue detection run in the background.'],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Eye
              return (
                <li key={t as string} className="card p-4">
                  <I className="h-5 w-5 text-brand-600" aria-hidden />
                  <div className="mt-2 font-medium text-slate-900">{t as string}</div>
                  <div className="text-sm text-slate-500">{d as string}</div>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="text-2xl font-semibold text-slate-900">How it works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(([t, d, Icon], i) => (
            <li key={t} className="card relative p-5">
              <span className="absolute right-4 top-4 text-xs font-semibold text-slate-300">0{i + 1}</span>
              <Icon className="h-5 w-5 text-brand-600" aria-hidden />
              <div className="mt-3 font-medium text-slate-900">{t}</div>
              <div className="mt-1 text-sm text-slate-500">{d}</div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-400">
        From community requests to completed action — automatically. · Strands Agents SDK · Amazon Bedrock ·
        FastAPI · React
      </footer>
    </div>
  )
}
