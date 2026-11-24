// One-off backfill: records the current offer letter template as the first stored revision of the offer letter history
// (migration 0023). Local development and one-off use only. It is not a migration and it is not run in deployment.
//
// Usage (from the backend folder; DATABASE_URL comes from .env, never printed):
//   node --env-file-if-exists=.env scripts/backfill-offer-letter-revision.mjs <tenantId>           (dry run, the default)
//   node --env-file-if-exists=.env scripts/backfill-offer-letter-revision.mjs <tenantId> --apply   (writes one row)
//
// Rules: it writes only when core_offer_letter_revision is empty. The revision number is the template's own revision
// when it is set (at least 1), otherwise 1. The file metadata and the uploader are copied from the template. The
// file must be an offer letter file (owner type offer_letter and the fixed offer letter owner id), or nothing is written.

import console from 'node:console';
import process from 'node:process';
import pg from 'pg';

const OFFER_LETTER_CODE = 'OFFER_LETTER';
const OFFER_LETTER_OWNER_TYPE = 'offer_letter';
const OFFER_LETTER_OWNER_ID = '00000000-0000-4000-8000-00000000f0f1';

const args = process.argv.slice(2);
const tenantId = args.find((a) => !a.startsWith('--')) ?? 'acme';
const apply = args.includes('--apply');

if (!/^[a-z][a-z0-9_]{0,39}$/.test(tenantId)) {
  console.error('Invalid tenant id.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const schema = `tenant_${tenantId}`;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query('BEGIN');
  await client.query(`SET LOCAL search_path TO "${schema}"`);

  const existing = await client.query('SELECT count(*)::int AS n FROM core_offer_letter_revision');
  if (existing.rows[0].n > 0) {
    console.log(
      `${schema}: ${existing.rows[0].n} revision(s) already stored. Nothing to backfill.`,
    );
    await client.query('ROLLBACK');
  } else {
    const tpl = await client.query(
      `SELECT id, revision, file_id, file_name, mime_type, size_bytes, created_by, updated_by, updated_at, status
         FROM core_document_template
        WHERE code = $1 AND status <> 'retired'
        ORDER BY revision DESC LIMIT 1`,
      [OFFER_LETTER_CODE],
    );
    const t = tpl.rows[0];
    if (!t) {
      console.log(`${schema}: no ${OFFER_LETTER_CODE} template found. Nothing to backfill.`);
      await client.query('ROLLBACK');
    } else if (!t.file_id) {
      console.log(`${schema}: the ${OFFER_LETTER_CODE} template has no file. Nothing to backfill.`);
      await client.query('ROLLBACK');
    } else {
      const file = await client.query(
        `SELECT id, owner_type, owner_id::text AS owner_id, size_bytes::bigint AS size_bytes,
                EXISTS (SELECT 1 FROM core_file_content c WHERE c.file_id = core_file.id) AS has_content
           FROM core_file WHERE id = $1`,
        [t.file_id],
      );
      const f = file.rows[0];
      if (!f) throw new Error('The template file row does not exist. Nothing written.');
      if (f.owner_type !== OFFER_LETTER_OWNER_TYPE || f.owner_id !== OFFER_LETTER_OWNER_ID) {
        throw new Error('The template file is not an offer letter file. Nothing written.');
      }

      const revision = t.revision != null && t.revision >= 1 ? t.revision : 1;
      const uploader = t.updated_by ?? t.created_by ?? null;
      console.log(
        `${schema}: plan = revision ${revision}, file ${t.file_name} (${t.mime_type}, ${t.size_bytes} bytes), ` +
          `uploader ${uploader ? 'set' : 'null'}, file content stored: ${f.has_content}`,
      );

      if (apply) {
        const inserted = await client.query(
          `INSERT INTO core_offer_letter_revision
             (revision, file_id, file_name, mime_type, size_bytes, created_at, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()), $7, $7)
           RETURNING id, revision`,
          [
            revision,
            t.file_id,
            t.file_name,
            t.mime_type,
            t.size_bytes ?? f.size_bytes,
            t.updated_at,
            uploader,
          ],
        );
        await client.query('COMMIT');
        console.log(
          `${schema}: wrote revision ${inserted.rows[0].revision} (id ${inserted.rows[0].id}).`,
        );
      } else {
        await client.query('ROLLBACK');
        console.log(`${schema}: dry run. Re-run with --apply to write this row.`);
      }
    }
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await client.end();
}
