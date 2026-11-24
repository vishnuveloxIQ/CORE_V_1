import type { PoolClient, QueryResultRow } from 'pg';

/**
 * Generic row helpers for the module repos. Table and column names are constants in the module that passes
 * them, never input, so interpolating them into SQL is safe. Values always travel as bound parameters.
 */

/** One column to write. cast names a Postgres type for the placeholder, such as jsonb. */
export interface Column {
  readonly name: string;
  readonly cast?: 'jsonb';
}

export async function one<T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const { rows } = await client.query<T>(sql, params);
  return rows[0] ?? null;
}

export async function many<T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { rows } = await client.query<T>(sql, params);
  return rows;
}

function placeholder(index: number, cast?: Column['cast']): string {
  return cast ? `$${index}::${cast}` : `$${index}`;
}

/** Inserts one row and returns its id. created_by and updated_by both take the actor. */
export async function insertRow(
  client: PoolClient,
  table: string,
  columns: readonly Column[],
  values: readonly unknown[],
  actorId: string | null,
): Promise<string> {
  const n = columns.length;
  const names = [...columns.map((c) => c.name), 'created_by', 'updated_by'];
  const marks = [...columns.map((c, i) => placeholder(i + 1, c.cast)), `$${n + 1}`, `$${n + 1}`];
  const row = await one<{ id: string }>(
    client,
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${marks.join(', ')}) RETURNING id`,
    [...values, actorId],
  );
  if (!row) throw new Error(`insert into ${table} returned no row`);
  return row.id;
}

/** Writes every column and bumps row_version. The row_version guard makes a stale write match nothing. */
export async function updateRow(
  client: PoolClient,
  table: string,
  columns: readonly Column[],
  id: string,
  rowVersion: number,
  values: readonly unknown[],
  actorId: string | null,
): Promise<boolean> {
  const n = columns.length;
  const sets = columns.map((c, i) => `${c.name} = ${placeholder(i + 1, c.cast)}`);
  sets.push(`updated_by = $${n + 1}`, 'updated_at = now()', 'row_version = row_version + 1');
  const row = await one<{ id: string }>(
    client,
    `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${n + 2} AND row_version = $${n + 3} RETURNING id`,
    [...values, actorId, id, rowVersion],
  );
  return row !== null;
}

/** One row by id, optionally locked until the transaction ends. */
export async function findRow<T extends QueryResultRow>(
  client: PoolClient,
  table: string,
  select: string,
  id: string,
  lock: boolean,
): Promise<T | null> {
  return one<T>(
    client,
    `SELECT ${select} FROM ${table} WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
}

/** Deletes one row. Returns false when no row matched. Foreign key violations surface as 23503. */
export async function deleteRow(client: PoolClient, table: string, id: string): Promise<boolean> {
  const row = await one<{ id: string }>(client, `DELETE FROM ${table} WHERE id = $1 RETURNING id`, [
    id,
  ]);
  return row !== null;
}

/** The row as the database stores it, in snake_case, for the audit snapshot. Audit redaction runs on it. */
export async function snapshotOf(
  client: PoolClient,
  table: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  const row = await one<{ row: Record<string, unknown> }>(
    client,
    `SELECT to_jsonb(t) AS row FROM ${table} AS t WHERE t.id = $1`,
    [id],
  );
  return row?.row ?? null;
}
