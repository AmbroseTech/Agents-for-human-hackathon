import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CATEGORY_COLORS, label } from '../lib/format'
import { Empty } from './ui'

const toRows = (data: Record<string, number>) =>
  Object.entries(data)
    .map(([name, value]) => ({ key: name, name: label(name), value }))
    .sort((a, b) => b.value - a.value)

export function CategoryDonut({ data }: { data: Record<string, number> }) {
  const rows = toRows(data)
  if (!rows.length) return <Empty>No requests yet.</Empty>
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-52 w-52 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
            >
              {rows.map((r) => (
                <Cell key={r.key} fill={CATEGORY_COLORS[r.key] ?? '#94a3b8'} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: CATEGORY_COLORS[r.key] ?? '#94a3b8' }}
            />
            <span className="flex-1 truncate text-slate-600">{r.name}</span>
            <span className="tabular-nums font-medium">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CountBars({ data, color = '#0f766e' }: { data: Record<string, number>; color?: string }) {
  const rows = toRows(data)
  if (!rows.length) return <Empty>Nothing to chart yet.</Empty>
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ left: -20, right: 8 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            interval={0}
            angle={-15}
            textAnchor="end"
            height={50}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} />
          <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
