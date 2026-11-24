/** CSV helpers shared by table export and bulk upload (RFC 4180: quotes, doubled quotes, CRLF). */

const escape = (v: string) => `"${v.replace(/"/g, '""')}"`

/** Rows → CSV text with a header row. */
export function toCsv(head: string[], rows: string[][]) {
  return [head.map(escape).join(','), ...rows.map((r) => r.map((c) => escape(c ?? '')).join(','))].join('\r\n')
}

/** Saves text as a file in the browser. A BOM keeps Excel happy with ₹ and other non-ASCII text. */
export function downloadText(fileName: string, text: string, type = 'text/csv;charset=utf-8;') {
  const blob = new Blob(['\uFEFF' + text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** CSV text → array of rows (array of cells). Blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Header-keyed records. Header names are matched case-insensitively, spaces → underscores. */
export function csvRecords(text: string) {
  const [head = [], ...body] = parseCsv(text)
  const keys = head.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return { keys, records: body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])) as Record<string, string>) }
}
