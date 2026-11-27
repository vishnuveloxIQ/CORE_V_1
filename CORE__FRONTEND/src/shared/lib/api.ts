/**
 * Client for the VeloxIQ Core API (see CORE__BACKEND/docs/frontend-handoff.md).
 *
 * Every call sends X-Tenant-Id and a fresh X-Request-Id, which the server echoes back and logs, so a failure can be
 * matched to the server's logs; a call the server does not answer within REQUEST_TIMEOUT_MS is abandoned.
 * Every call sends X-Tenant-Id. Protected calls send the bearer access token, and a 401 triggers one token refresh
 * and one retry. POST and PATCH calls send an Idempotency-Key (a fresh UUID per user action unless the caller
 * passes one to retry the same action). Success bodies are { data, meta? }; errors are { error: { code, message } }.
 *
 * The access token lives in memory only. The refresh token is kept in sessionStorage so a reload keeps the session
 * until the tab closes; refreshing rotates it, so only the newest one is ever stored.
 */

/** Same-origin path in development (Vite proxies /api to the backend). Set VITE_API_BASE_URL for other setups. */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api'
const TENANT_KEY = 'veloxiq-core-tenant:v1'
// Held in memory as well, so a tab whose storage is blocked still keeps the company chosen at sign-in.
let chosenTenant: string | null = null

/**
 * The company this tab is signed in to, or null when none has been chosen. There is no default company: it always
 * comes from the login ID's prefix (see modules/auth/utils/tenants.ts), so a login can never fall into the wrong one.
 */
export function tenantId(): string | null {
  try {
    return sessionStorage.getItem(TENANT_KEY) ?? chosenTenant
  } catch {
    return chosenTenant
  }
}

/** Forgets the company for this tab, so a sign-in finds the company from the login ID itself. */
export function clearTenantId(): void {
  chosenTenant = null
  try {
    sessionStorage.removeItem(TENANT_KEY)
  } catch {
    /* blocked storage: nothing to clear */
  }
}

/** Sets the company for this tab. */
export function setTenantId(id: string): void {
  chosenTenant = id
  try {
    sessionStorage.setItem(TENANT_KEY, id)
  } catch {
    /* blocked storage: the in-memory choice stays */
  }
}

/** Routes that run before anyone is signed in. The server needs the company from the header to find the login. */
const PRE_LOGIN_ROUTE = /^\/auth\/(refresh|password-reset\/)/

const REFRESH_KEY = 'veloxiq-core-refresh:v1'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown
  /** seconds, from Retry-After on 429 */
  readonly retryAfter?: number
  /** the X-Request-Id of the failed call, quoted to support so they can find it in the server logs */
  requestId?: string
  constructor(status: number, code: string, message: string, details?: unknown, retryAfter?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.retryAfter = retryAfter
  }
}

export interface TokenPair {
  accessToken: string
  accessTokenExpiresIn: number
  refreshToken: string
  refreshTokenExpiresAt: string
}

let accessToken: string | null = null
let refreshing: Promise<boolean> | null = null
let onSessionLost: ((reason?: string) => void) | null = null
/** The error code the server gave for the last refused refresh (e.g. SESSION_REPLACED), or null. */
let lastRefusalCode: string | null = null
let onPasswordChange: (() => void) | null = null

const store = {
  get: () => { try { return sessionStorage.getItem(REFRESH_KEY) } catch { return null } },
  set: (v: string | null) => {
    try { if (v) sessionStorage.setItem(REFRESH_KEY, v); else sessionStorage.removeItem(REFRESH_KEY) } catch { /* storage blocked: session lasts until reload */ }
  },
}

/** Keeps the tokens from a login or refresh. */
export function setTokens(t: Pick<TokenPair, 'accessToken' | 'refreshToken'> | null) {
  accessToken = t?.accessToken ?? null
  store.set(t?.refreshToken ?? null)
  // a step-up check belongs to the signed-in session, so signing out drops it
  if (!t) stepUp = null
}

/** A step-up token from a passkey or password check: held in memory only, for its five minutes. */
let stepUp: { token: string; expiresAt: number; method: 'passkey' | 'password' } | null = null

/** Keeps the step-up token from a passkey or password check (null clears it). */
export function setStepUpToken(token: string | null, expiresAt?: string, method: 'passkey' | 'password' = 'passkey') {
  stepUp = token && expiresAt ? { token, expiresAt: Date.parse(expiresAt), method } : null
}

/**
 * True while a usable step-up token is held and not about to expire. A password check counts only for an action that
 * accepts one (`allowPassword`, as geo-fence changes do); privilege grants need a passkey check.
 */
export const hasStepUp = (opts: { allowPassword?: boolean } = {}) =>
  !!stepUp && stepUp.expiresAt - Date.now() > 15_000 && (stepUp.method === 'passkey' || !!opts.allowPassword)

/** Routes that need a step-up token (grants and geo-fence zones). Keep in step with the backend's needsStepUp rule. */
const STEP_UP_ROUTE = /^\/access\/users\/[^/]+\/grants$|^\/access\/grants\/[^/]+$|^\/geo-zones(\/[^/]+)?$/

export const hasSession = () => !!accessToken || !!store.get()

/** Called once when the session cannot be restored (refresh refused), so the app can sign the user out. */
export function onSessionExpired(handler: ((reason?: string) => void) | null) {
  onSessionLost = handler
}

/**
 * Called when the server answers 403 PASSWORD_CHANGE_REQUIRED (the user signed in with a temporary password), so the
 * app can send them to the change-password page. Every protected API call goes through here, so this is the one place.
 */
export function onPasswordChangeRequired(handler: (() => void) | null) {
  onPasswordChange = handler
}

const uuid = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16))

/** A fresh Idempotency-Key. Make one per user action and reuse it only to retry that same action. */
export const idempotencyKey = uuid

async function parse(res: Response) {
  const text = await res.text()
  if (!text) return null
  try { return JSON.parse(text) as unknown } catch { return null }
}

function toError(res: Response, body: unknown): ApiError {
  const err = (body as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error
  if (res.status === 403 && err?.code === 'PASSWORD_CHANGE_REQUIRED') onPasswordChange?.()
  const retry = Number(res.headers.get('Retry-After'))
  const error = new ApiError(
    res.status,
    err?.code ?? `HTTP_${res.status}`,
    err?.message ?? (res.status >= 500 ? 'The server could not complete the request. Try again.' : `Request failed (${res.status}).`),
    err?.details,
    Number.isFinite(retry) && retry > 0 ? retry : undefined,
  )
  error.requestId = res.headers.get('X-Request-Id') ?? undefined
  return error
}

/** How long a call may wait for the server before it is abandoned. File content gets longer. */
export const REQUEST_TIMEOUT_MS = 30_000
export const UPLOAD_TIMEOUT_MS = 120_000

async function send(method: string, path: string, init: { body?: unknown; raw?: RawBody; key?: string; auth: boolean }) {
  const tenant = tenantId()
  // a pre-login call with no company chosen is never sent: it would be a login with no company
  if (!tenant && PRE_LOGIN_ROUTE.test(path)) {
    throw new ApiError(400, 'TENANT_REQUIRED', 'Enter your login ID first, so we know which company it belongs to.')
  }
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (tenant) headers['X-Tenant-Id'] = tenant
  if (init.raw) headers['Content-Type'] = init.raw.contentType
  else if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  if (init.auth && accessToken) headers.Authorization = `Bearer ${accessToken}`
  // whichever token is held goes along; the server decides which routes accept a password check
  if (method !== 'GET' && stepUp && hasStepUp({ allowPassword: true }) && STEP_UP_ROUTE.test(path)) headers['X-Step-Up-Token'] = stepUp.token
  if (init.key) headers['Idempotency-Key'] = init.key
  const requestId = uuid()
  headers['X-Request-Id'] = requestId
  const payload = init.raw ? init.raw.body : init.body === undefined ? undefined : JSON.stringify(init.body)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.raw ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}${path}`, { method, headers, body: payload, signal: controller.signal })
    // a 503 from readiness (database down) or password reset (no email provider) is that route's own answer; any
    // other 503 means the API itself is being updated or restarted
    setReachability(res.status === 503 && !/^\/(health|auth\/password-reset)/.test(path) ? 'maintenance' : 'ok')
    return res
  } catch {
    setReachability('offline')
    const error = controller.signal.aborted
      ? new ApiError(0, 'TIMEOUT', 'The server took too long to answer. Check whether your change was saved before you try again.')
      : new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.')
    error.requestId = requestId
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/**
 * CORE-28-03: whether the server can be reached, for the app-wide banner. `offline` after a call could not reach the
 * server or timed out; `maintenance` after 503 Service Unavailable (an update or restart in progress); back to `ok` on
 * the next answer. A failed call never reports success: the screen that made it shows its own error too.
 */
export type Reachability = 'ok' | 'offline' | 'maintenance'
let reachability: Reachability = 'ok'
const reachabilityListeners = new Set<(r: Reachability) => void>()
function setReachability(next: Reachability) {
  if (next === reachability) return
  reachability = next
  for (const l of reachabilityListeners) l(next)
}
export const currentReachability = () => reachability
/** Subscribes to reachability changes; returns the unsubscribe function. */
export function onReachability(listener: (r: Reachability) => void): () => void {
  reachabilityListeners.add(listener)
  return () => { reachabilityListeners.delete(listener) }
}

/** What a user reads when the server has ended this device's session (expired, signed out elsewhere, or revoked). */
/** The server's code when this user signed in on another device and the session ended for that reason. */
export const SESSION_REPLACED_CODE = 'SESSION_REPLACED'
export const SESSION_ENDED_MESSAGE = 'You have been signed out. Your session ended, or this device was signed out from another one. Sign in again.'

/**
 * The session cannot be restored: sign the app out, and throw one plain error instead of the server's token message,
 * so a screen that shows the error reads "You have been signed out…" rather than "Access token is invalid or expired".
 */
function sessionEnded(): never {
  onSessionLost?.(lastRefusalCode ?? undefined)
  throw new ApiError(401, 'SESSION_ENDED', SESSION_ENDED_MESSAGE)
}

/** Swaps the stored refresh token for a new pair. Only one refresh runs at a time. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = store.get()
    if (!refreshToken) return false
    // a refresh token without a company cannot be used: drop it so the guard sends the user to sign in
    if (!tenantId()) { setTokens(null); return false }
    const res = await send('POST', '/auth/refresh', { body: { refreshToken }, auth: false })
    const body = await parse(res)
    if (!res.ok) {
      lastRefusalCode = (body as { error?: { code?: string } } | null)?.error?.code ?? null;
      // a refused refresh token means the session is gone (expired, signed out, or revoked after reuse)
      if (res.status === 401 || res.status === 400) setTokens(null)
      return false
    }
    setTokens((body as { data: TokenPair }).data)
    return true
  })().finally(() => { refreshing = null })
  return refreshing
}

/** Raw bytes sent as the request body (file content); `contentType` is sent as given. */
export interface RawBody { body: Blob; contentType: string }

export interface RequestOptions {
  body?: unknown
  raw?: RawBody
  /** pass the same key to retry the same action; a new one is made otherwise */
  idempotencyKey?: string
  /** false for the public auth routes */
  auth?: boolean
}

/** Calls the API and returns the whole success envelope ({ data, meta? }). Throws ApiError. */
async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, opts: RequestOptions = {}): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const auth = opts.auth ?? true
  const isAuthRoute = path.startsWith('/auth/')
  const key = (method === 'POST' || method === 'PATCH' || method === 'PUT') && !isAuthRoute ? (opts.idempotencyKey ?? uuid()) : undefined
  if (auth && !accessToken && store.get()) await refreshSession()
  let res = await send(method, path, { body: opts.body, raw: opts.raw, key, auth })
  // a step-up refusal (a wrong password or passkey, or a missing check) is not an expired session: no refresh, no retry
  if (res.status === 401 && auth && !(await isStepUpAnswer(res))) {
    if (await refreshSession()) res = await send(method, path, { body: opts.body, raw: opts.raw, key, auth })
    else sessionEnded()
  }
  const body = await parse(res)
  if (!res.ok) throw toError(res, body)
  return (body as { data: T; meta?: Record<string, unknown> } | null) ?? { data: undefined as T }
}

/** True when a 401 is the server's step-up answer (STEP_UP_REQUIRED, STEP_UP_FAILED), not a sign of a lost session. */
async function isStepUpAnswer(res: Response): Promise<boolean> {
  try {
    const body = (await res.clone().json()) as { error?: { code?: unknown } } | null
    return typeof body?.error?.code === 'string' && body.error.code.startsWith('STEP_UP')
  } catch {
    return false
  }
}

/** Calls the API and returns `data` from the success envelope. Throws ApiError. */
export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, opts: RequestOptions = {}): Promise<T> {
  return (await request<T>(method, path, opts)).data
}

/** GET a paged list: returns its rows and the `meta` of the success envelope (e.g. { limit, offset, total }). Throws ApiError. */
export async function apiPage<T>(path: string): Promise<{ rows: T[]; meta: Record<string, unknown> }> {
  const { data, meta } = await request<T[]>('GET', path)
  return { rows: data ?? [], meta: meta ?? {} }
}

/** GET for a binary response (file content). Same sign-in and refresh rules as `api`. Throws ApiError. */
export async function apiBlob(path: string): Promise<Blob> {
  if (!accessToken && store.get()) await refreshSession()
  let res = await send('GET', path, { auth: true })
  if (res.status === 401) {
    if (await refreshSession()) res = await send('GET', path, { auth: true })
    else sessionEnded()
  }
  if (!res.ok) throw toError(res, await parse(res))
  return res.blob()
}

/** Field errors from a VALIDATION_ERROR, keyed by field name when the server names them. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !err.details) return {}
  const out: Record<string, string> = {}
  const d = err.details as unknown
  const list = Array.isArray(d) ? d : Array.isArray((d as { issues?: unknown[] }).issues) ? (d as { issues: unknown[] }).issues : []
  // the backend sends { issues: [{ path: 'code', message }] }; a nested path such as 'levels.0.approverId' keeps its first part
  for (const issue of list as { path?: string | (string | number)[]; field?: string; message?: string }[]) {
    const path = Array.isArray(issue.path) ? issue.path.map(String) : (issue.path ?? '').split('.')
    const name = issue.field ?? path[0] ?? ''
    if (name && issue.message && !out[name]) out[name] = issue.message
  }
  return out
}

/** A message that is safe to show: the server's message, never a stack trace. */
export const errorText = (err: unknown) => {
  if (!(err instanceof ApiError)) return 'Something went wrong. Try again.'
  // a server fault or a timeout carries the request ID, so the user can quote it to support
  const traceable = (err.status >= 500 || err.code === 'TIMEOUT') && err.requestId
  return traceable ? `${err.message} Reference: ${err.requestId}.` : err.message
}
