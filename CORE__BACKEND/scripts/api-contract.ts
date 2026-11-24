/**
 * API v1 contract helpers, shared by the snapshot command and the lock test.
 *
 * The contract is the generated OpenAPI document with its wording removed (summaries and descriptions), so a
 * reworded summary does not count as a change, but a new, removed or changed operation, parameter, request body or
 * security rule does.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const WORDING = new Set(['summary', 'description']);

/** The document with keys sorted and wording removed: equal contracts give equal text. */
export function contractOf(value: unknown): Json {
  if (Array.isArray(value)) return value.map(contractOf);
  if (value !== null && typeof value === 'object') {
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value).sort()) {
      if (WORDING.has(key)) continue;
      out[key] = contractOf((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value as Json;
}

/** Sorted-key JSON, so the snapshot file is stable from one run to the next. */
export function stableJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]));
    }
    return v;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

interface Doc {
  info: { version: string };
  paths: Record<string, Record<string, unknown>>;
}

export interface ContractDiff {
  removed: string[];
  added: string[];
  changed: string[];
}

/** What differs between the locked document and the current one, operation by operation. */
export function diffContracts(locked: Doc, current: Doc): ContractDiff {
  const ops = (doc: Doc) =>
    new Map(
      Object.entries(doc.paths).flatMap(([path, methods]) =>
        Object.entries(methods).map(([method, op]) => [`${method.toUpperCase()} ${path}`, JSON.stringify(contractOf(op))] as const),
      ),
    );
  const before = ops(locked);
  const after = ops(current);
  const diff: ContractDiff = { removed: [], added: [], changed: [] };
  for (const [name, shape] of before) {
    if (!after.has(name)) diff.removed.push(name);
    else if (after.get(name) !== shape) diff.changed.push(name);
  }
  for (const name of after.keys()) if (!before.has(name)) diff.added.push(name);
  return diff;
}
