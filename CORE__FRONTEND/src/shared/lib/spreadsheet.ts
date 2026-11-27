import * as XLSX from 'xlsx'

/**
 * Reads the first sheet of an Excel workbook (.xlsx or .xls) into the same shape as csvRecords: normalised headings
 * and one object of trimmed text per row. Empty rows are dropped.
 */
export function spreadsheetRecords(data: ArrayBuffer) {
  const book = XLSX.read(data, { type: 'array', cellDates: false })
  const first = book.SheetNames[0]
  if (!first) return { keys: [] as string[], records: [] as Record<string, string>[] }
  const sheet = book.Sheets[first]
  if (!sheet) return { keys: [] as string[], records: [] as Record<string, string>[] }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '', blankrows: false })
  const [head = [], ...body] = rows
  const keys = head.map((h) => String(h ?? '').trim().toLowerCase().replace(/\s+/g, '_'))
  const records = body
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, String((r as unknown[])[i] ?? '').trim()])) as Record<string, string>)
    .filter((r) => Object.values(r).some((v) => v !== ''))
  return { keys, records }
}
