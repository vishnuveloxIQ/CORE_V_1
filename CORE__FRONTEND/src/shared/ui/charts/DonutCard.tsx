import type { ReactNode } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { Card } from '@/shared/ui/Card'

export interface Slice { label: string; value: number; /** CSS colour, e.g. 'var(--c-green)' */ color: string }
interface Props { title: string; subtitle?: string; slices: Slice[]; /** which slice counts as "done" for the centre % */ doneLabel?: string; className?: string
  /** top-right of the card, e.g. a filter */
  action?: ReactNode
  /** below the donut */
  footer?: ReactNode
  /** shown instead of the donut when every slice is 0 */
  empty?: ReactNode
}

/** Donut + legend list. Centre shows the share of `doneLabel` (default: first slice). */
export function DonutCard({ title, subtitle, slices, doneLabel, className, action, footer, empty }: Props) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const done = (slices.find((s) => s.label === doneLabel) ?? slices[0])?.value ?? 0
  const pct = total ? Math.round((done / total) * 100) : 0
  const data = slices.filter((s) => s.value > 0)
  return (
    <Card className={className} title={title} subtitle={subtitle} action={action}>
      {total === 0 && empty ? empty : (
      <div className="ring-wrap donut-hover">
        <div style={{ width: 170, height: 170, position: 'relative' }} role="img" aria-label={`${pct}% ${doneLabel ?? slices[0]?.label}, ${total} in total`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart accessibilityLayer={false}>
              <Pie rootTabIndex={-1} data={data} dataKey="value" nameKey="label" innerRadius={56} outerRadius={78} paddingAngle={data.length > 1 ? 4 : 0} cornerRadius={8} stroke="none" startAngle={90} endAngle={-270} animationDuration={800}>
                {data.map((s) => <Cell key={s.label} fill={s.color} className="donut-slice" />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
            <div>
              <div style={{ font: '700 30px var(--font-d)', letterSpacing: '-.03em', lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 4 }}>{(doneLabel ?? slices[0]?.label ?? '').toLowerCase()}</div>
            </div>
          </div>
        </div>
        <div className="stat-list">
          {slices.map((s) => (
            <div key={s.label} className="stat-row">
              <i className="dot" style={{ background: s.color }} /><span>{s.label}</span><strong>{s.value}</strong>
              <span className="bar"><b style={{ width: `${total ? (s.value / total) * 100 : 0}%`, background: s.color }} /></span>
            </div>
          ))}
        </div>
      </div>
      )}
      {footer}
    </Card>
  )
}
