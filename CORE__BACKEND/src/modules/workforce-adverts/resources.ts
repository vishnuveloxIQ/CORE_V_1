import type { PoolClient } from 'pg';
import { many, one } from '../../core/rows.js';
import { field, filterUuid, invalid, type Issue, type PrepareContext, type ResourceSpec, type Row } from '../../core/resource.js';
import {
  advertCreateBody, advertIdFilter, advertPatchBody, advertStatusFilter, interestCreateBody, interestIdFilter,
  interestPatchBody, interestStatusFilter, mailCreateBody, requirementCreateBody, requirementPatchBody, stepCreateBody,
} from './schema.js';

// Workforce adverts (migration 0070). Errors use the WORKFORCE_ADVERT prefix or the row's own field path.

/** The advert's fields a published advert may not change (only its status and closing reason move). */
const FROZEN_ON_PUBLISH = ['title', 'projectId', 'state', 'description', 'requiredFrom', 'requiredTo', 'closesAt'] as const;

async function nextAdvertCode(client: PoolClient): Promise<string> {
  const prefix = `WA-${new Date().getUTCFullYear()}-`;
  const row = await one<{ n: number }>(
    client,
    `SELECT COALESCE(MAX(substring(code from '[0-9]+$')::int), 0) + 1 AS n FROM core_workforce_advert WHERE code LIKE $1`,
    [`${prefix}%`],
  );
  return `${prefix}${String(row?.n ?? 1).padStart(4, '0')}`;
}

/** The message each registered sub-contractor is due: the state, the project, the work and the start date. */
function advertMessage(code: string, row: Row, projectName: string): string {
  return [
    `Head office has a workforce requirement for you (${code}).`,
    `State: ${row.state ? String(row.state) : 'to be confirmed'}`,
    `Project: ${projectName}`,
    `Work: ${String(row.title)}`,
    `Start date: ${String(row.requiredFrom)}`,
    '',
    'Reply if you are interested.',
  ].join('\n');
}

async function publishAdvert(client: PoolClient, existing: Row, row: Row): Promise<Row> {
  const id = String(existing.id);
  const count = await one<{ n: number }>(client, 'SELECT count(*)::int AS n FROM core_workforce_advert_requirement WHERE advert_id = $1', [id]);
  if (!count || count.n < 1) throw invalid({ path: 'status', message: 'Add at least one worker requirement before publishing.' });
  const project = await one<{ name: string }>(client, 'SELECT name FROM core_project WHERE id = $1', [String(row.projectId)]);
  // every registered, active sub-contractor with a mail ID is due the message; a repeat publish cannot queue twice
  const subs = await many<{ id: string; mailId: string }>(
    client,
    `SELECT id, mail_id AS "mailId" FROM core_sub_contractor WHERE status = 'active' AND mail_id IS NOT NULL`,
    [],
  );
  const subject = `Workforce requirement ${String(existing.code)}: ${String(row.title)}`;
  const body = advertMessage(String(existing.code), row, project?.name ?? '');
  for (const s of subs) {
    await client.query(
      `INSERT INTO core_advert_mail (advert_id, sub_contractor_id, to_address, subject, body)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (advert_id, sub_contractor_id) DO NOTHING`,
      [id, s.id, s.mailId, subject, body],
    );
  }
  return { publishedAt: new Date().toISOString() };
}

async function prepareAdvert({ client, existing, row }: PrepareContext): Promise<Row> {
  if (!existing) {
    return { code: await nextAdvertCode(client), status: 'DRAFT', publishedAt: null, closedAt: null, closedReason: null };
  }
  const from = String(existing.status);
  const to = String(row.status ?? from);
  if (from === 'CLOSED' && to !== 'CLOSED') throw invalid({ path: 'status', message: 'A closed advert cannot change.' });
  if (to !== from && !((from === 'DRAFT' && to === 'PUBLISHED') || (from === 'PUBLISHED' && to === 'CLOSED'))) {
    throw invalid({ path: 'status', message: `An advert cannot go from ${from} to ${to}.` });
  }
  if (from !== 'DRAFT') {
    for (const key of FROZEN_ON_PUBLISH) {
      if (String(row[key] ?? '') !== String(existing[key] ?? '')) {
        throw invalid({ path: key, message: 'A published advert cannot be edited. Close it and raise a new one.' });
      }
    }
  }
  if (from === 'DRAFT' && to === 'PUBLISHED') return publishAdvert(client, existing, row);
  if (from === 'PUBLISHED' && to === 'CLOSED') {
    const reason = row.closedReason ? String(row.closedReason) : '';
    if (!reason) throw invalid({ path: 'closedReason', message: 'Give a reason for closing the advert.' });
    return { closedAt: new Date().toISOString(), closedReason: reason };
  }
  return {};
}

async function assertDraft(client: PoolClient, advertId: string): Promise<void> {
  const advert = await one<{ status: string }>(client, 'SELECT status FROM core_workforce_advert WHERE id = $1', [advertId]);
  if (!advert) throw invalid({ path: 'advertId', message: 'The advert was not found.' });
  if (advert.status !== 'DRAFT') throw invalid({ path: 'advertId', message: 'Requirements can change only while the advert is a draft.' });
}

export const workforceAdvertSpec: ResourceSpec = {
  table: 'core_workforce_advert',
  prefix: 'WORKFORCE_ADVERT',
  label: 'Workforce advert',
  fields: [
    field('title', 'text'),
    field('projectId', 'uuid'),
    field('state', 'text'),
    field('description', 'text'),
    field('requiredFrom', 'date'),
    field('requiredTo', 'date'),
    field('closesAt', 'date'),
    field('code', 'text'),
    field('status', 'text'),
    field('publishedAt', 'ts'),
    field('closedAt', 'ts'),
    field('closedReason', 'text'),
  ],
  create: advertCreateBody,
  patch: advertPatchBody,
  filters: {
    status: { column: 'status', schema: advertStatusFilter },
    projectId: { column: 'project_id', schema: filterUuid },
  },
  orderBy: 'required_from desc, code',
  check: (row: Row): Issue | null => {
    if (row.requiredTo && String(row.requiredTo) < String(row.requiredFrom)) {
      return { path: 'requiredTo', message: 'The end date cannot be before the start date.' };
    }
    return null;
  },
  prepare: prepareAdvert,
  beforeDelete: async (_client: PoolClient, row: Row) => {
    if (row.status !== 'DRAFT') throw invalid({ path: 'status', message: 'Only a draft advert can be deleted.' });
  },
};

export const workforceRequirementSpec: ResourceSpec = {
  table: 'core_workforce_advert_requirement',
  prefix: 'WORKFORCE_ADVERT_REQUIREMENT',
  label: 'Requirement',
  fields: [
    field('advertId', 'uuid'),
    field('workerType', 'text'),
    field('trade', 'text'),
    field('notes', 'text'),
  ],
  create: requirementCreateBody,
  patch: requirementPatchBody,
  filters: { advertId: { column: 'advert_id', schema: advertIdFilter } },
  orderBy: 'created_at, id',
  prepare: async ({ client, row }: PrepareContext): Promise<Row> => {
    await assertDraft(client, String(row.advertId));
    return {};
  },
  beforeDelete: async (client: PoolClient, row: Row) => {
    await assertDraft(client, String(row.advertId));
  },
};

/** Messages queued for registered sub-contractors. Written only when an advert is published. */
export const advertMailSpec: ResourceSpec = {
  table: 'core_advert_mail',
  prefix: 'ADVERT_MAIL',
  label: 'Advert message',
  fields: [
    field('advertId', 'uuid'),
    field('subContractorId', 'uuid'),
    field('toAddress', 'text'),
    field('subject', 'text'),
    field('body', 'text'),
    field('status', 'text'),
  ],
  create: mailCreateBody,
  patch: mailCreateBody,
  filters: { advertId: { column: 'advert_id', schema: advertIdFilter } },
  orderBy: 'created_at, id',
};

export const contractorInterestSpec: ResourceSpec = {
  table: 'core_contractor_interest',
  prefix: 'CONTRACTOR_INTEREST',
  label: 'Interest',
  fields: [
    field('advertId', 'uuid'),
    field('subContractorId', 'uuid'),
    field('firmName', 'text'),
    field('contactName', 'text'),
    field('mailId', 'text'),
    field('phone', 'text'),
    field('source', 'text'),
    field('status', 'text'),
    field('reason', 'text'),
  ],
  create: interestCreateBody,
  patch: interestPatchBody,
  filters: {
    advertId: { column: 'advert_id', schema: advertIdFilter },
    status: { column: 'status', schema: interestStatusFilter },
    subContractorId: { column: 'sub_contractor_id', schema: filterUuid },
  },
  orderBy: 'created_at, id',
  check: (row: Row): Issue | null => {
    if (row.status === 'DECLINED' && !row.reason) {
      return { path: 'reason', message: 'Give a reason for declining.' };
    }
    if (!row.subContractorId && !row.firmName) {
      return { path: 'firmName', message: 'Name the contractor, or choose a registered sub-contractor.' };
    }
    return null;
  },
  prepare: async ({ client, existing, row }: PrepareContext): Promise<Row> => {
    if (existing) return {};
    if (!row.subContractorId) {
      // a contractor who is not registered: only the advert must be published
      const open = await one<{ status: string }>(client, 'SELECT status FROM core_workforce_advert WHERE id = $1', [String(row.advertId)]);
      if (!open) throw invalid({ path: 'advertId', message: 'The advert was not found.' });
      if (open.status !== 'PUBLISHED') throw invalid({ path: 'advertId', message: 'Interest can be recorded only on a published advert.' });
      return {};
    }
    const advert = await one<{ status: string }>(client, 'SELECT status FROM core_workforce_advert WHERE id = $1', [String(row.advertId)]);
    if (!advert) throw invalid({ path: 'advertId', message: 'The advert was not found.' });
    if (advert.status !== 'PUBLISHED') throw invalid({ path: 'advertId', message: 'Interest can be recorded only on a published advert.' });
    const sub = await one<{ status: string }>(client, 'SELECT status FROM core_sub_contractor WHERE id = $1', [String(row.subContractorId)]);
    if (!sub || sub.status !== 'active') throw invalid({ path: 'subContractorId', message: 'Only an active registered sub-contractor can be recorded.' });
    const taken = await one<{ id: string }>(client, 'SELECT id FROM core_contractor_interest WHERE advert_id = $1 AND sub_contractor_id = $2', [String(row.advertId), String(row.subContractorId)]);
    if (taken) throw invalid({ path: 'subContractorId', message: 'This sub-contractor already has an interest on this advert.' });
    return {};
  },
};

/** Discussion steps against an interest, recorded by the recruiter. */
export const interestStepSpec: ResourceSpec = {
  table: 'core_interest_step',
  prefix: 'INTEREST_STEP',
  label: 'Discussion step',
  fields: [field('interestId', 'uuid'), field('remarks', 'text')],
  create: stepCreateBody,
  patch: stepCreateBody,
  filters: { interestId: { column: 'interest_id', schema: interestIdFilter } },
  orderBy: 'created_at, id',
};
