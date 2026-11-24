import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, errorText, REQUEST_TIMEOUT_MS, setTenantId, setTokens } from '@/shared/lib/api'

// CORE-16-03: every call carries a request ID, a stalled call is abandoned, and a server fault shows a reference.

const headersOf = (init: RequestInit | undefined) => (init?.headers ?? {}) as Record<string, string>

describe('API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    setTokens(null)
  })

  it('sends a fresh X-Request-Id on every call', async () => {
    setTenantId('acme')
    setTokens({ accessToken: 'test-access', refreshToken: 'test-refresh' })
    const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 })))
    vi.stubGlobal('fetch', fetch)
    await api('GET', '/vendors')
    await api('GET', '/vendors')
    const ids = fetch.mock.calls.map((c) => headersOf((c as unknown as [string, RequestInit])[1])['X-Request-Id'])
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(ids[1]).toMatch(/^[0-9a-f-]{36}$/)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('quotes the server request ID with a server fault', async () => {
    setTenantId('acme')
    setTokens({ accessToken: 'test-access', refreshToken: 'test-refresh' })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'Something failed on the server.' } }), {
      status: 500, headers: { 'X-Request-Id': 'req-7f' },
    }))))
    const err = await api('GET', '/vendors').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).requestId).toBe('req-7f')
    expect(errorText(err)).toBe('Something failed on the server. Reference: req-7f.')
  })

  it('shows no reference for an ordinary refusal', async () => {
    setTenantId('acme')
    setTokens({ accessToken: 'test-access', refreshToken: 'test-refresh' })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: { code: 'VERSION_CONFLICT', message: 'Reload and try again.' } }), {
      status: 409, headers: { 'X-Request-Id': 'req-80' },
    }))))
    expect(errorText(await api('GET', '/vendors').catch((e: unknown) => e))).toBe('Reload and try again.')
  })

  it('abandons a call the server does not answer in time', async () => {
    vi.useFakeTimers()
    setTenantId('acme')
    setTokens({ accessToken: 'test-access', refreshToken: 'test-refresh' })
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const pending = api('GET', '/vendors').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1)
    const err = (await pending) as ApiError
    expect(err.code).toBe('TIMEOUT')
    expect(errorText(err)).toMatch(/^The server took too long to answer\..* Reference: [0-9a-f-]{36}\.$/)
  })
})
