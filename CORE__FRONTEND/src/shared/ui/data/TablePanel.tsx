import { useAutoAnimate } from '@formkit/auto-animate/react'
import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { cn } from '@/shared/lib/cn'
import { downloadText, toCsv } from '@/shared/lib/csv'
import { requireStepUp } from '@/shared/lib/stepUp'
import { notify } from '@/shared/lib/toast'
import { Icon } from '@/shared/ui/icons'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import { headingCase, titleCase } from '@/shared/lib/format'

export type CellKind = 'c-id' | 'c-sub' | 'c-amt' | 'c-status' | 'c-more'

export interface Column<T> {
  header: string
  kind: CellKind
  cell: (row: T) => ReactNode
  /** plain-text value used for CSV export (defaults to cell text) */
  csv?: (row: T) => string
  className?: string
}

interface Props<T> {
  title: string
  subtitle: string
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** text matched by the search box */
  searchText: (row: T) => string
  /** status shown in the filter chips; omit to hide the chips */
  statusOf?: (row: T) => string
  /** trailing action cell */
  action?: (row: T) => ReactNode
  searchPlaceholder?: string
  exportName?: string
  className?: string
  /** small print under the table, right-aligned */
  footNote?: string
  /** extra filter controls shown in the toolbar, after the search box */
  filters?: ReactNode
  /** show only the N most-used chips; the rest go in a "More" list */
  chipLimit?: number
  /** usage score per chip value (higher first); defaults to the number of rows */
  chipRank?: (value: string, count: number) => number
  /** word used for the chips, e.g. "categories" */
  chipNoun?: string
  /** chips that start switched on, e.g. from a link */
  initialPicked?: string[]
}


export function TablePanel<T>({ title, subtitle, columns, rows, rowKey, searchText, statusOf, action, searchPlaceholder = 'Search records…', exportName = 'veloxiq-export', className, footNote, filters, chipLimit, chipRank, chipNoun = 'filters', initialPicked = [] }: Props<T>) {
  const [query, setQuery] = useState('')
  /** chip filter — several can be on at once; none = all */
  const [picked, setPicked] = useState<string[]>(initialPicked)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [tbodyRef] = useAutoAnimate<HTMLTableSectionElement>({ duration: 180 })

  const counts = useMemo(() => {
    if (!statusOf) return [] as [string, number][]
    const c = new Map<string, number>()
    rows.forEach((r) => c.set(statusOf(r), (c.get(statusOf(r)) ?? 0) + 1))
    const list = [...c.entries()]
    return chipLimit ? list.sort((a, b) => (chipRank ? chipRank(b[0], b[1]) - chipRank(a[0], a[1]) : b[1] - a[1])) : list
  }, [rows, statusOf, chipLimit, chipRank])
  const alpha = (list: [string, number][]) => [...list].sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))
  // usage decides which chips are shown up front; they are then listed A-Z
  const shownChips = alpha(chipLimit ? counts.filter(([k], i) => i < chipLimit || picked.includes(k)) : counts)
  const moreChips = alpha(chipLimit ? counts.filter(([k], i) => i >= chipLimit && !picked.includes(k)) : [])

  const q = query.trim().toLowerCase()
  const visible = rows.filter((r) => (!q || searchText(r).toLowerCase().includes(q)) && (!picked.length || picked.includes(statusOf?.(r) ?? '')))
  const togglePick = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))

  /** heading sort: none -> ascending -> descending -> none (original order) */
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const cycleSort = (key: string) => setSort((s) => (!s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null))
  const sortCol = sort ? columns.find((c) => c.header === sort.key) : undefined
  const shown = useMemo(() => {
    if (!sort || !sortCol?.csv) return visible
    const val = sortCol.csv
    const num = (s: string) => (/^[\s₹$€£+-]*[\d,]*\.?\d+\s*(?:cr|l|k)?\s*$/i.test(s) ? Number(s.replace(/[^\d.+-]/g, '')) : NaN)
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...visible].sort((a, b) => {
      const x = val(a), y = val(b)
      const nx = num(x), ny = num(y)
      if (!Number.isNaN(nx) && !Number.isNaN(ny)) return (nx - ny) * sign
      return x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' }) * sign
    })
  }, [visible, sort, sortCol])

  const exportCsv = async () => {
    if (!visible.length) return notify('There are no visible records to export.')
    // PRD §4: data export needs step-up authentication
    if (!(await requireStepUp(`Export ${title.toLowerCase()}`))) return
    downloadText(`${exportName}.txt`, toCsv(columns.map((c) => c.header), shown.map((r) => columns.map((c) => (c.csv ? c.csv(r) : '')))))
    notify('Text file downloaded from the visible records')
  }

  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  return (
    <section className={cn('card table-panel', className)} data-enter>
      <div className="card-h">
        <div>
          <h2 className="card-t">{headingCase(title)}</h2>
          <div className="card-s">{subtitle}</div>
        </div>
        <button type="button" className="text-link" onClick={exportCsv}><Icon name="download" />Download</button>
      </div>

      <div className="toolbar" style={filters ? { alignItems: 'flex-end' } : undefined}>
        {statusOf && (
          <div className="chips" role="group" aria-label={`Filter by ${chipNoun} (select one or more)`}>
            {chipLimit && counts.length > chipLimit && <span className="chips-label">Most used</span>}
            <button type="button" className="chip" aria-pressed={picked.length === 0} onClick={() => setPicked([])}>All <em>{rows.length}</em></button>
            {shownChips.map(([k, n]) => (
              <button key={k} type="button" className="chip" aria-pressed={picked.includes(k)} onClick={() => togglePick(k)}>{k} <em>{n}</em></button>
            ))}
            {moreChips.length > 0 && (
              <SearchSelect
                placeholder={`More ${chipNoun} (${moreChips.length})`}
                ariaLabel={`More ${chipNoun}`}
                searchPlaceholder={`Search ${chipNoun}…`}
                options={moreChips.map(([k, n]) => ({ value: k, label: k, hint: String(n) }))}
                onSelect={togglePick}
              />
            )}
          </div>
        )}
        <div className="search-wrap">
          <Icon name="search" />
          <input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} autoComplete="off" />
        </div>
        {filters}
        {(query || picked.length > 0) && <Button size="sm" onClick={() => { setQuery(''); setPicked([]) }}>Clear filters</Button>}
      </div>

      {visible.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((c) => {
                  const dir = sort?.key === c.header ? sort.dir : null
                  return (
                    <th key={c.header} aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : c.csv ? 'none' : undefined}>
                      {c.csv ? (
                        <button type="button" className="th-sort" data-dir={dir ?? undefined} onClick={() => cycleSort(c.header)} title="Sort: ascending, descending, original order">
                          {titleCase(c.header)}<span className="sort-ind" aria-hidden="true">{dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : '↕'}</span>
                        </button>
                      ) : titleCase(c.header)}
                    </th>
                  )
                })}
                {action && <th className="c-act"><span className="sr-only">Action</span></th>}
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {shown.map((r) => {
                const k = rowKey(r)
                const isOpen = open.has(k)
                return (
                  <tr key={k} className={cn(isOpen && 'open')}>
                    {columns.map((c) => (
                      <td key={c.header} className={cn(c.kind, c.kind === 'c-amt' && 'amount', c.className)} data-label={titleCase(c.header)}>{c.cell(r)}</td>
                    ))}
                    {action && (
                      <td className="c-act" data-label="Action">
                        <button type="button" className="more-toggle" aria-expanded={isOpen} onClick={() => toggle(k)}>
                          <span>{isOpen ? 'Hide details' : 'More details'}</span><Icon name="chevD" />
                        </button>
                        {action(r)}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No matching records">Try a different search term or clear the filters.</EmptyState>
      )}

      <div className="table-foot">
        <span aria-live="polite">Showing {visible.length} record{visible.length === 1 ? '' : 's'}</span>
        {footNote && <span>{footNote}</span>}
      </div>
    </section>
  )
}
