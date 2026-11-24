import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from '@/shared/ui/Card'

export interface BarSeries { key: string; name: string; /** CSS colour, e.g. 'var(--chart-1)' */ color: string }
export type BarRow = { label: string; /** shown in the tooltip title */ full?: string } & Record<string, string | number | undefined>

interface Props {
  title: string
  subtitle?: string
  data: BarRow[]
  series: BarSeries[]
  /** top-right of the card, e.g. a filter */
  action?: ReactNode
  /** below the legend */
  footer?: ReactNode
  /** shown instead of the chart when there is no data */
  empty?: ReactNode
  className?: string
}

/** Grouped bar chart in the house colours. Colours come from CSS vars, so dark mode just works. */
export function BarsCard({ title, subtitle, data, series, action, footer, empty, className }: Props) {
  return (
    <Card className={className} title={title} subtitle={subtitle} action={action}>
      {data.length === 0 && empty ? empty : (
        <>
          <div className="chart" style={{ minHeight: 250 }} role="img" aria-label={`${title}${subtitle ? ', ' + subtitle : ''}`}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart accessibilityLayer={false} data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }} barGap={3} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={0} />
                <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                <Tooltip
                  cursor={{ fill: 'var(--card-2)' }}
                  content={({ active, payload, label }) => active && payload?.length ? (
                    <div className="chart-tip2">
                      <b>{(payload[0]?.payload as BarRow | undefined)?.full ?? label}</b>
                      {payload.map((p) => <div key={String(p.dataKey)}>{series.find((s) => s.key === p.dataKey)?.name} {String(p.value)}</div>)}
                    </div>
                  ) : null}
                />
                {series.map((s) => <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[6, 6, 0, 0]} maxBarSize={22} animationDuration={700} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.name}</span>)}</div>
        </>
      )}
      {footer}
    </Card>
  )
}
