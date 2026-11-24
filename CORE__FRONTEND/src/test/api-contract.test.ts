/// <reference types="node" />
// Node types for this test only: it reads source files and the backend contract from disk.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// CORE-20-02: every API call the frontend makes is an operation in the frozen backend contract (API v1).
// It reads the frontend source, finds each call's method and path, and matches it against
// CORE__BACKEND/docs/api/openapi-v1.json. A call to a path or method the backend does not have fails here.

const ROOT = resolve(__dirname, '..')
const CONTRACT = resolve(__dirname, '../../../CORE__BACKEND/docs/api/openapi-v1.json')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

/** The path the call reaches: `${base}` resolved, a `${…}` after a slash is a path parameter, anything else is query. */
function normalise(raw: string, base: string | undefined): string {
  let path = raw
    .slice(1)
    .replace(/^\$\{base\}/, base ?? '${base}')
    // the path('/vendors', id) helper builds /vendors/{id}
    .replace(/^\$\{path\('([^']+)',[^}]*\)\}/, '$1/{param}')
  const cut = path.search(/(?<!\/)\$\{|\?/)
  if (cut >= 0) path = path.slice(0, cut)
  return path.replace(/\/\$\{[^}]*\}+/g, '/{param}').replace(/[`'"]+$/, '').replace(/\/$/, '') || '/'
}

interface Call { method: string; path: string; file: string }

function callsIn(file: string): Call[] {
  const text = readFileSync(file, 'utf8')
  const base = /const base = ['"`]([^'"`]+)['"`]/.exec(text)?.[1]
  const out: Call[] = []
  for (const m of text.matchAll(/'(GET|POST|PUT|PATCH|DELETE)',\s*(`[^`]*`?|'[^']*')/g)) {
    out.push({ method: m[1]!, path: normalise(m[2]!, base), file })
  }
  for (const m of text.matchAll(/\b(apiPage|apiBlob)(?:<[^()]*?>)?\(\s*(`[^`]*`?|'[^']*')/g)) {
    out.push({ method: 'GET', path: normalise(m[2]!, base), file })
  }
  return out
}

describe.skipIf(!existsSync(CONTRACT))('frontend calls match the frozen API v1 contract', () => {
  const contract = JSON.parse(readFileSync(CONTRACT, 'utf8')) as { paths: Record<string, Record<string, unknown>> }
  const operations = Object.entries(contract.paths).flatMap(([path, methods]) =>
    Object.keys(methods).map((method) => ({ method: method.toUpperCase(), pattern: new RegExp(`^${path.replace(/\{[^}]+\}/g, '[^/]+')}$`) })),
  )
  const calls = sourceFiles(ROOT).flatMap(callsIn)

  it('finds the frontend API calls', () => {
    expect(calls.length).toBeGreaterThan(100)
  })

  it('every call is an operation the backend documents (method and path)', () => {
    const missing = calls
      .filter((c) => !operations.some((op) => op.method === c.method && op.pattern.test(c.path.replace(/\{param\}/g, 'x'))))
      .map((c) => `${c.method} ${c.path}  (${c.file.slice(ROOT.length + 1).replace(/\\/g, '/')})`)
    expect([...new Set(missing)]).toEqual([])
  })
})
