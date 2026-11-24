import { createHash } from 'node:crypto';
import type { CoreApp, CoreRequest } from '../../http/app.js';
import { AppError } from '../../core/errors.js';
import { hashRequest, runIdempotent } from '../../core/idempotency.js';
import { ok } from '../../core/response.js';
import { parseInput } from '../../core/validation.js';
import {
  type Actor,
  type RouteOptions,
  authOf,
  createRecord,
  guardRoute,
  idempotencyKeyOf,
  idParamsSchema,
  inTenant,
  registerResourceRoutes,
} from '../../core/resource.js';
import { withTenant } from '../../db/tenant.js';
import {
  FILE_CONTENT_MAX_BYTES,
  FILE_CONTENT_TYPES,
  isAllowedFileContentType,
  mediaTypeOf,
} from './rules.js';
import {
  fileSpec,
  grievanceSpec,
  importBatchSpec,
  importRowSpec,
  notificationSpec,
  ticketSpec,
  timelineSpec,
  usageCounterSpec,
} from './resources.js';
import {
  importRowCreateBody,
  notificationCreateBody,
  rowVersionBody,
  usageIncrementBody,
} from './schema.js';
import {
  addImportRow,
  incrementCounter,
  listOwnNotifications,
  markNotificationRead,
  ownNotification,
  readFileContent,
  storeFileContent,
  submitBatch,
} from './service.js';

export const RECORDS_MANAGE = 'records.manage';

/**
 * Registers the record routes (Phase 5f). Writes to files, grievances, notifications, tickets (status and priority),
 * import batches and rows, and usage counters need records.manage. Timeline entries and raising a ticket need only a
 * signed-in user. Notifications are read only through the owner-scoped routes below.
 */
export function registerRecordsRoutes(app: CoreApp, options: RouteOptions): void {
  const manage = RECORDS_MANAGE;

  registerResourceRoutes(app, options, fileSpec, {
    path: '/files',
    create: manage,
    update: manage,
    remove: manage,
  });
  registerFileContentRoutes(app, options);
  // Append-only: no update or remove route is registered for the timeline.
  registerResourceRoutes(app, options, timelineSpec, { path: '/record-timeline', create: null });
  registerResourceRoutes(app, options, grievanceSpec, {
    path: '/grievances',
    create: manage,
    update: manage,
    remove: manage,
  });
  // Anyone raises a ticket; only records.manage changes it afterwards.
  registerResourceRoutes(app, options, ticketSpec, {
    path: '/tickets',
    create: null,
    update: manage,
  });
  registerResourceRoutes(app, options, importBatchSpec, {
    path: '/import-batches',
    create: manage,
  });
  // Rows are read here; they are written only through POST /import-batches/:id/rows.
  registerResourceRoutes(app, options, importRowSpec, { path: '/import-rows' });
  registerResourceRoutes(app, options, usageCounterSpec, { path: '/usage-counters' });

  // Notifications: the list and the single read are limited to the signed-in recipient.
  app.post('/notifications', guardRoute(options, manage, { summary: 'POST /notifications', body: notificationCreateBody }), async (request, reply) => {
    const body = parseInput(notificationCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createRecord(client, notificationSpec, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.get('/notifications', guardRoute(options, null), async (request) =>
    ok(await inTenant(options, request, (client, actor) => listOwnNotifications(client, actor))),
  );

  app.get('/notifications/:id', guardRoute(options, null), async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    return ok(
      await inTenant(options, request, (client, actor) => ownNotification(client, actor, id)),
    );
  });

  app.post('/notifications/:id/read', guardRoute(options, null, { summary: 'POST /notifications/:id/read' }), async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    return ok(
      await inTenant(options, request, (client, actor) => markNotificationRead(client, actor, id)),
    );
  });

  app.post('/import-batches/:id/submit', guardRoute(options, manage, { summary: 'POST /import-batches/:id/submit', body: rowVersionBody }), async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const { rowVersion } = parseInput(rowVersionBody, request.body);
    return ok(
      await inTenant(options, request, (client, actor) =>
        submitBatch(client, actor, id, rowVersion),
      ),
    );
  });

  app.post('/import-batches/:id/rows', guardRoute(options, manage, { summary: 'POST /import-batches/:id/rows', body: importRowCreateBody }), async (request, reply) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const body = parseInput(importRowCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      addImportRow(client, actor, id, body),
    );
    return reply.code(201).send(ok(created));
  });

  // An increment is an upsert: it answers 200 whether it created the counter or added to it.
  app.post('/usage-counters/increment', guardRoute(options, manage, { summary: 'POST /usage-counters/increment', body: usageIncrementBody }), async (request) => {
    const body = parseInput(usageIncrementBody, request.body);
    return ok(
      await inTenant(options, request, (client, actor) => incrementCounter(client, actor, body)),
    );
  });
}

/**
 * Refuses an upload before its body is read: the media type must be one of the allowed types, and a declared
 * Content-Length over the limit is 413. The body limit on each parser is the second guard.
 */
async function checkFileUpload(request: CoreRequest): Promise<void> {
  if (!isAllowedFileContentType(mediaTypeOf(request.headers['content-type']))) {
    throw new AppError('UNSUPPORTED_FILE_TYPE', 400, 'This file type is not supported');
  }
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > FILE_CONTENT_MAX_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 413, 'The file is larger than 2 MB');
  }
}

/**
 * File content (migration 0015): PUT stores the raw bytes of a file row, GET streams them back. The parsers keep
 * the bytes as a Buffer for the allowed media types only; the JSON parser is untouched.
 */
function registerFileContentRoutes(app: CoreApp, options: RouteOptions): void {
  const manage = RECORDS_MANAGE;

  app.addContentTypeParser(
    [...FILE_CONTENT_TYPES],
    { parseAs: 'buffer', bodyLimit: FILE_CONTENT_MAX_BYTES },
    (_request, body, done) => done(null, body),
  );

  // Replacing content is a write, so it carries an Idempotency-Key like the POST and PATCH routes. The request
  // hash covers the checksum, not the bytes, so the stored request is small.
  app.put(
    '/files/:id/content',
    {
      ...guardRoute(options, manage, {
        summary: 'Upload a file’s content',
        rawBody: 'The file’s bytes. The Content-Type header names its media type.',
      }),
      onRequest: [checkFileUpload],
    },
    async (request) => {
      const { id } = parseInput(idParamsSchema, request.params);
      const mediaType = mediaTypeOf(request.headers['content-type']);
      const content = request.body;
      if (!Buffer.isBuffer(content)) {
        throw new AppError('FILE_EMPTY', 400, 'The file is empty');
      }
      const key = idempotencyKeyOf(request);
      const auth = authOf(request);
      const actor: Actor = { actorId: auth.userId, correlationId: request.id };
      const requestHash = hashRequest({
        method: request.method,
        route: request.routeOptions.url,
        params: { id },
        mediaType,
        sizeBytes: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
      });
      const outcome = await withTenant(options.pool, auth.tenantId, (client) =>
        runIdempotent(client, { key, requestHash }, () =>
          storeFileContent(client, actor, id, mediaType, content),
        ),
      );
      return ok(outcome.value);
    },
  );

  app.get('/files/:id/content', guardRoute(options, null), async (request, reply) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const file = await inTenant(options, request, (client, actor) =>
      readFileContent(client, actor, id, manage),
    );
    return reply
      .header('content-type', file.contentType)
      .header('cache-control', 'private, max-age=0')
      .send(file.content);
  });
}
