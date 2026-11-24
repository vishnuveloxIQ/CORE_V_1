import { useRef, useState, type ReactNode } from 'react'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { CheckRow, FormGroup, Input, Select, Textarea } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { PageHead } from '@/modules/shell'
import { StatTile } from '@/shared/ui/StatTile'
import { StatusBadge, type StatusTone } from '@/shared/ui/Status'
import { useEnter } from '@/shared/hooks/useMotion'
import { notify } from '@/shared/lib/toast'
import { ICON_NAMES, Icon } from '@/shared/ui/icons'

const SWATCHES: [string, string, string][] = [
  ['--navy', 'Brand navy', 'Primary buttons, active menu item'],
  ['--blue', 'Blue', 'Links, gradient start'],
  ['--rose-d', 'Rose', 'Accent line, dark-mode primary'],
  ['--page', 'Page', 'Page background'],
  ['--card-solid', 'Card', 'Cards, sidebar'],
  ['--ink', 'Ink', 'Headings and body text'],
  ['--muted', 'Muted', 'Secondary text'],
  ['--line', 'Line', 'Borders and dividers'],
  ['--green', 'Success', 'Approved, paid, positive'],
  ['--amber', 'Warning', 'Pending, needs attention'],
  ['--red', 'Danger', 'Rejected, destructive'],
  ['--sky', 'Info', 'In review, informational'],
]
const TONES: StatusTone[] = ['pending', 'approved', 'rejected', 'review', 'draft']

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <Card title={title} subtitle={hint} style={{ marginBottom: 16 }}>{children}</Card>
}
const Rule = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
  <li style={{ display: 'flex', gap: 8, margin: '6px 0', color: 'var(--ink-2)' }}>
    <b style={{ color: ok ? 'var(--green)' : 'var(--red)' }}>{ok ? 'Do' : "Don't"}</b><span>{children}</span>
  </li>
)

/** Live reference: every shared component, rendered. Change a token in variant-classic.css and this page shows the result. */
export default function StyleGuide() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'style-guide')
  const [open, setOpen] = useState(false)
  return (
    <div ref={ref}>
      <PageHead crumb="Style guide" title="Style guide" desc="Everything a screen is allowed to use. If it isn't here, ask before inventing it." />

      <Section title="Layout rules" hint="The frame is fixed. Screens only fill the content area.">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))' }}>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            <Rule ok>Start every screen with <code>PageHead</code> (breadcrumb, title, one-line description, actions).</Rule>
            <Rule ok>Put content in <code>Card</code>s or <code>TablePanel</code>. One primary button per screen.</Rule>
            <Rule ok>Use the grids: <code>grid stats</code> (4 tiles), <code>grid dash-grid</code> (2/3 + 1/3), <code>form-grid</code> (2 columns).</Rule>
            <Rule ok>Use colour tokens (<code>var(--ink)</code>…) so dark mode works.</Rule>
          </ul>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            <Rule ok={false}>Restyle the header, footer or sidebar for a single screen. White header and footer are intentional in both themes.</Rule>
            <Rule ok={false}>Hard-code hex colours, new fonts or custom shadows in a screen.</Rule>
            <Rule ok={false}>Put content straight on the grey page background.</Rule>
            <Rule ok={false}>Build your own table, button or form field: use the shared ones.</Rule>
          </ul>
        </div>
      </Section>

      <Section title="Colour" hint="Use the CSS variable, never the hex. Both themes are defined in src/styles/variant-classic.css.">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
          {SWATCHES.map(([v, name, use]) => (
            <div key={v} style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', background: 'var(--card-2)' }}>
              <div style={{ height: 52, background: `var(${v})` }} />
              <div style={{ padding: '8px 10px', fontSize: 12 }}><b style={{ display: 'block' }}>{name}</b><code>{v}</code><div style={{ color: 'var(--muted)', marginTop: 2 }}>{use}</div></div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography" hint="Headings: Plus Jakarta Sans. Body: Inter.">
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ font: '800 34px var(--font-d)', letterSpacing: '-.03em' }}>Page title — 34/800</div>
          <div style={{ font: '700 17px var(--font-d)' }}>Card title — 17/700</div>
          <div style={{ fontSize: 14 }}>Body text — Inter 14/400. Sentence case everywhere, no ALL CAPS except menu group labels.</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Secondary text — 12.5, muted colour</div>
        </div>
      </Section>

      <Section title="Buttons" hint="tone: primary · secondary (default) · success · danger. size: md · sm. Add icon / iconRight from the icon set.">
        <div className="form-actions" style={{ justifyContent: 'flex-start', margin: 0 }}>
          <Button tone="primary" icon="plus">Primary</Button>
          <Button>Secondary</Button>
          <Button tone="success" icon="check">Success</Button>
          <Button tone="danger" icon="xc">Danger</Button>
          <Button size="sm">Small</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Status badges" hint="<StatusBadge tone=…>Label</StatusBadge>: same five tones everywhere.">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{TONES.map((t) => <StatusBadge key={t} tone={t}>{t[0].toUpperCase() + t.slice(1)}</StatusBadge>)}</div>
      </Section>

      <Section title="Stat tiles" hint="Four per row on desktop. tone: blue · green · gold · rose. Add `to` to make a tile a link.">
        <div className="grid stats" style={{ marginBottom: 0 }}>
          <StatTile label="Blue tile" value={128} icon="files" tone="blue" trend="8.2%" />
          <StatTile label="Green tile" value="₹2.96 L" icon="rupee" tone="green" />
          <StatTile label="Gold tile" value={14} icon="clock" tone="gold" />
          <StatTile label="Rose tile" value={3} icon="chatq" tone="rose" />
        </div>
      </Section>

      <Section title="Form fields" hint="FormGroup handles label, required star, helper and error text with correct aria.">
        <div className="form-grid">
          <FormGroup label="Text input" required helper="Helper text goes here.">{(id, d) => <Input id={id} aria-describedby={d} placeholder="Type here" />}</FormGroup>
          <FormGroup label="With error" error="This is what an error looks like.">{(id, d) => <Input id={id} aria-describedby={d} aria-invalid defaultValue="Bad value" />}</FormGroup>
          <FormGroup label="Select">{(id) => <Select id={id}><option>Option one</option><option>Option two</option></Select>}</FormGroup>
          <FormGroup label="Textarea" full>{(id) => <Textarea id={id} placeholder="Longer text" />}</FormGroup>
          <div className="form-group full"><CheckRow label="Checkbox row" defaultChecked /></div>
        </div>
      </Section>

      <Section title="Dialog, toast, empty state, avatar">
        <div className="form-actions" style={{ justifyContent: 'flex-start', margin: '0 0 16px' }}>
          <Button onClick={() => setOpen(true)}>Open dialog</Button>
          <Button onClick={() => notify('This is a toast message.')}>Show toast</Button>
          <Avatar name="Priya Sharma" /><Avatar name="Ravi Kumar" /><Avatar name="Meera Das" /><Avatar name="Arun Reddy" />
        </div>
        <EmptyState title="Nothing here yet">Use this when a list or search has no results.</EmptyState>
        <Modal open={open} onOpenChange={setOpen} title="Dialog title">
          <p style={{ marginTop: 0 }}>Dialogs hold details and quick decisions. Keep actions bottom-right, primary last.</p>
          <div className="form-actions"><Button onClick={() => setOpen(false)}>Cancel</Button><Button tone="primary" onClick={() => setOpen(false)}>Confirm</Button></div>
        </Modal>
      </Section>

      <Section title="Icons" hint="Lucide outline set, used as <Icon name=“…” />. To add one, edit src/theme/icons.tsx.">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 10 }}>
          {ICON_NAMES.map((n) => (
            <div key={n} style={{ display: 'grid', placeItems: 'center', gap: 6, padding: '12px 4px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card-2)', fontSize: 11, color: 'var(--muted)' }}>
              <Icon name={n} /><span>{n}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
