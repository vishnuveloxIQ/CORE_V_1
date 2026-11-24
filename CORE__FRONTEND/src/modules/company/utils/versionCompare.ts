/** Field-by-field comparison of two policy versions (CORE-25-02). */

type Flat = Map<string, string>

/** "shifts.0.inTime" → "Shifts 1 › In time": readable labels for nested fields. */
const labelOf = (path: string) =>
  path.split('.').map((p) => (/^\d+$/.test(p) ? String(Number(p) + 1) : p.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()))).join(' › ')

/** Flattens a version's data into readable field → value pairs; objects and lists are walked, values shortened. */
export function flatten(value: unknown, prefix = '', out: Flat = new Map()): Flat {
  if (value === null || value === undefined) { if (prefix) out.set(prefix, '—'); return out }
  if (Array.isArray(value)) {
    if (!value.length && prefix) out.set(prefix, 'None')
    value.forEach((v, i) => flatten(v, prefix ? `${prefix}.${i}` : String(i), out))
    return out
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (!entries.length && prefix) out.set(prefix, 'None')
    for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out)
    return out
  }
  out.set(prefix || 'value', typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value))
  return out
}

/** Every field in either version, with both values and whether it changed. */
export function compareVersions(a: unknown, b: unknown): Array<{ field: string; from: string; to: string; changed: boolean }> {
  const fa = flatten(a)
  const fb = flatten(b)
  const keys = [...new Set([...fa.keys(), ...fb.keys()])]
  return keys.map((k) => {
    const from = fa.get(k) ?? 'Not set'
    const to = fb.get(k) ?? 'Not set'
    return { field: labelOf(k), from, to, changed: from !== to }
  })
}
