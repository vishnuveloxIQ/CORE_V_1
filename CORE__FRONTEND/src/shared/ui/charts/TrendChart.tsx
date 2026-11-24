import { useId } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from '@/shared/ui/Card'

export interface TrendPoint { label: string; a: number; b?: number }
interface Props {
  title: string
  subtitle?: string
  data: TrendPoint[]
  /** legend / tooltip names for series a and b */
  names?: [string, string?]
  /** formats axis + tooltip numbers */
  format?: (n: number) => string
  className?: string
}

/** Two-series area chart in the house colours (navy + rose). Colours come from CSS vars, so dark mode just works. */
export function TrendChart({ title, subtitle, data, names = ['Series A', 'Series B'], format = (n) => String(n), className }: Props) {
  const uid = useId().replace(/:/g, '')
  const hasB = data.some((d) => d.b !== undefined)
  return (
    <Card className={className} title={title} subtitle={subtitle}>
      <div className="chart" style={{ minHeight: 250 }} role="img" aria-label={`${title}${subtitle ? ', ' + subtitle : ''}`}>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart accessibilityLayer={false} data={data} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
            <defs>
              <linearGradient id={`${uid}a`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-1)" stopOpacity={0.32} /><stop offset="1" stopColor="var(--chart-1)" stopOpacity={0} /></linearGradient>
              <linearGradient id={`${uid}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-2)" stopOpacity={0.26} /><stop offset="1" stopColor="var(--chart-2)" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} width={44} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={(v: number) => format(v)} />
            <Tooltip
              cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 4' }}
              content={({ active, label, payload }) => active && payload?.length ? (
                <div className="chart-tip2"><b>{label}</b>{payload.map((p) => <div key={String(p.dataKey)}>{p.dataKey === 'a' ? names[0] : names[1]} {format(Number(p.value))}</div>)}</div>
              ) : null}
            />
            <Area type="monotone" dataKey="a" stroke="var(--chart-1)" strokeWidth={2.5} fill={`url(#${uid}a)`} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
            {hasB && <Area type="monotone" dataKey="b" stroke="var(--chart-2)" strokeWidth={2.5} fill={`url(#${uid}b)`} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--chart-1)' }} />{names[0]}</span>
        {hasB && <span><i style={{ background: 'var(--chart-2)' }} />{names[1]}</span>}
      </div>
    </Card>
  )
}
