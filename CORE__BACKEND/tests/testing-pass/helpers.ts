import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import type { Pool } from 'pg';
import { expect } from 'vitest';
import { hashSecret } from '../../src/core/password.js';
import { grantPrivilegeByLogin } from '../../src/modules/access/bootstrap.js';

// Shared helpers for the Phase N-1 testing pass. Example data is fictional.

export const PASSWORD = 'Correct-Horse-Battery-9';
export const JWT_SECRET = 'testing-pass-secret-with-at-least-32-characters';

export interface Reply {
  statusCode: number;
  body: string;
  json: () => unknown;
}

export interface Claims {
  sub: string;
  sid: string;
  tid: string;
}

export function uniqueLogin(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/** Inserts an active user with a password into one tenant schema. The schema name is a constant from the tests. */
export async function seedUser(pool: Pool, schema: string, loginId: string): Promise<string> {
  const hash = await hashSecret(PASSWORD);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ${schema}.core_user (login_id, name, status, password_hash, failed_count)
     VALUES ($1, 'Testing Pass User', 'active', $2, 0)
     RETURNING id`,
    [loginId, hash],
  );
  return rows[0]!.id;
}

export async function signIn(
  app: CoreApp,
  tenant: string,
  loginId: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { 'x-tenant-id': tenant },
    payload: { loginId, password: PASSWORD },
  });
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as { data: { accessToken: string } }).data.accessToken;
}

/** Reads the claims of a token without checking its signature. Used only to build test tokens. */
export function claimsOf(token: string): Claims {
  const payload = token.split('.')[1] ?? '';
  const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  return { sub: String(json['sub']), sid: String(json['sid']), tid: String(json['tid']) };
}

export async function grant(pool: Pool, tenant: string, loginId: string, privilege: string) {
  await grantPrivilegeByLogin(pool, { tenantId: tenant, loginId, privilege });
}

/**
 * The Idempotency-Key header a request needs: a fresh key for module POST and PATCH writes. Auth routes and
 * offline operations take none (see requiresIdempotencyKey in src/plugins/openapi.ts).
 */
export function idempotencyFor(method: string, url: string): Record<string, string> {
  const write = method === 'POST' || method === 'PATCH';
  if (!write || /^\/(auth\/|offline-operations)/.test(url)) {
    return {};
  }
  return { 'idempotency-key': globalThis.crypto.randomUUID() };
}

export async function call(
  app: CoreApp,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  token: string | null,
  payload?: object,
  extraHeaders: Record<string, string> = {},
): Promise<Reply> {
  const res = await app.inject({
    method,
    url,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...idempotencyFor(method, url),
      ...extraHeaders,
    },
    ...(payload !== undefined ? { payload } : {}),
  });
  return { statusCode: res.statusCode, body: res.body, json: () => res.json() as unknown };
}
