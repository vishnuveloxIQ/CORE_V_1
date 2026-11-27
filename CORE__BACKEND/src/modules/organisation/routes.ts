import type { CoreApp } from '../../http/app.js';
import type { Pool } from 'pg';
import { inTenant } from '../../core/resource.js';
import { AppError } from '../../core/errors.js';
import { findCompany } from './repo.js';
import { checkOneTimeCode } from '../registration/service.js';
import { ok } from '../../core/response.js';
import { rowById } from '../../core/detail.js';
import { parseInput } from '../../core/validation.js';
import { type AuthGuardOptions, createRequireAuth, requireAccess } from '../../plugins/auth.js';
import {
  createDepartment,
  createHoliday,
  createPosition,
  createSeries,
  createShift,
  deleteDepartment,
  deleteHoliday,
  deletePosition,
  getCompany,
  listDepartmentRecords,
  listHolidayRecords,
  listPositionRecords,
  listSeriesRecords,
  listShiftRecords,
  putCompany,
  updateDepartmentRecord,
  updateHolidayRecord,
  updatePositionRecord,
  updateSeriesRecord,
  updateShiftRecord,
} from './service.js';
import {
  companyProfileBody,
  departmentCreateBody,
  departmentPatchBody,
  holidayCreateBody,
  holidayPatchBody,
  idParamsSchema,
  positionCreateBody,
  positionPatchBody,
  seriesCreateBody,
  seriesPatchBody,
  shiftCreateBody,
  shiftPatchBody,
} from './schema.js';

/** The privilege for every write under /organisation. Reads need only a signed-in user. */
export const ORGANISATION_MANAGE = 'organisation.manage';

export interface OrganisationRouteOptions {
  pool: Pool;
  signingKey: Uint8Array;
}

/**
 * Organisation routes (Phase 5a). Reads need a signed-in user. Writes need organisation.manage at company
 * scope. A missing or invalid token answers 401; a missing privilege answers 403.
 */
export function registerOrganisationRoutes(
  app: CoreApp,
  options: OrganisationRouteOptions,
): void {
  const guard: AuthGuardOptions = { pool: options.pool, signingKey: options.signingKey };
  const requireAuth = createRequireAuth(guard);
  const requireManage = requireAccess(guard, ORGANISATION_MANAGE);
  const read = { preHandler: requireAuth };
  const write = { preHandler: [requireAuth, requireManage] };

  app.get('/organisation/holidays/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listHolidayRecords(client));
    return ok(rowById(rows, id, 'Holiday'));
  });
  app.get('/organisation/shifts/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listShiftRecords(client));
    return ok(rowById(rows, id, 'Shift'));
  });
  app.get('/organisation/number-series/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listSeriesRecords(client));
    return ok(rowById(rows, id, 'Number series'));
  });
  app.get('/organisation/departments/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listDepartmentRecords(client));
    return ok(rowById(rows, id, 'Department'));
  });
  app.get('/organisation/positions/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listPositionRecords(client));
    return ok(rowById(rows, id, 'Position'));
  });

  // Company profile.

  app.get('/organisation/company-profile', read, async (request) =>
    ok(await inTenant(options, request, (client) => getCompany(client))),
  );

  app.put('/organisation/company-profile', { ...write, config: { openapi: { summary: 'PUT /organisation/company-profile', body: companyProfileBody } } }, async (request, reply) => {
    const { mobileCode, ...body } = parseInput(companyProfileBody, request.body);
    const result = await inTenant(options, request, async (client, actor) => {
      // A change to the owner or director (name, email or mobile) is proved with a code sent to the mobile number.
      // The number is India's (+91). Other changes need no code.
      const current = await findCompany(client);
      const ownerChanged =
        (body.contactName ?? null) !== (current?.contactName ?? null) ||
        (body.contactEmail ?? null) !== (current?.contactEmail ?? null) ||
        (body.contactPhone ?? null) !== (current?.contactPhone ?? null);
      const mobile = body.contactPhone ?? null;
      if (mobile && ownerChanged) {
        if (!mobileCode) {
          throw new AppError('MOBILE_CODE_REQUIRED', 400, 'Send a code to the mobile number and enter it to save.');
        }
        const matches = await checkOneTimeCode(options.pool, 'mobile', `+91${mobile}`, mobileCode);
        if (!matches) {
          throw new AppError('REGISTRATION_CODE_INVALID', 400, 'The mobile code is wrong or has expired. Request a new code.');
        }
      }
      return putCompany(client, actor, body);
    });
    return reply.code(result.created ? 201 : 200).send(ok(result.profile));
  });

  // Holidays.

  app.get('/organisation/holidays', read, async (request) =>
    ok(await inTenant(options, request, (client) => listHolidayRecords(client))),
  );

  app.post('/organisation/holidays', { ...write, config: { openapi: { summary: 'POST /organisation/holidays', body: holidayCreateBody } } }, async (request, reply) => {
    const body = parseInput(holidayCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createHoliday(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/organisation/holidays/:id', { ...write, config: { openapi: { summary: 'PATCH /organisation/holidays/:id', body: holidayPatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(holidayPatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateHolidayRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  app.delete('/organisation/holidays/:id', { ...write, config: { openapi: { summary: 'DELETE /organisation/holidays/:id' } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    await inTenant(options, request, (client, actor) => deleteHoliday(client, actor, id));
    return ok({ deleted: true });
  });

  // Shifts. No delete: is_active false deactivates a shift (design point f).

  app.get('/organisation/shifts', read, async (request) =>
    ok(await inTenant(options, request, (client) => listShiftRecords(client))),
  );

  app.post('/organisation/shifts', { ...write, config: { openapi: { summary: 'POST /organisation/shifts', body: shiftCreateBody } } }, async (request, reply) => {
    const body = parseInput(shiftCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createShift(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/organisation/shifts/:id', { ...write, config: { openapi: { summary: 'PATCH /organisation/shifts/:id', body: shiftPatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(shiftPatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateShiftRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  // Number series. No delete and no allocation endpoint (design point g).

  app.get('/organisation/number-series', read, async (request) =>
    ok(await inTenant(options, request, (client) => listSeriesRecords(client))),
  );

  app.post('/organisation/number-series', { ...write, config: { openapi: { summary: 'POST /organisation/number-series', body: seriesCreateBody } } }, async (request, reply) => {
    const body = parseInput(seriesCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createSeries(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/organisation/number-series/:id', { ...write, config: { openapi: { summary: 'PATCH /organisation/number-series/:id', body: seriesPatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(seriesPatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateSeriesRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  // Departments.

  app.get('/organisation/departments', read, async (request) =>
    ok(await inTenant(options, request, (client) => listDepartmentRecords(client))),
  );

  app.post('/organisation/departments', { ...write, config: { openapi: { summary: 'POST /organisation/departments', body: departmentCreateBody } } }, async (request, reply) => {
    const body = parseInput(departmentCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createDepartment(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/organisation/departments/:id', { ...write, config: { openapi: { summary: 'PATCH /organisation/departments/:id', body: departmentPatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(departmentPatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateDepartmentRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  app.delete('/organisation/departments/:id', { ...write, config: { openapi: { summary: 'DELETE /organisation/departments/:id' } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    await inTenant(options, request, (client, actor) => deleteDepartment(client, actor, id));
    return ok({ deleted: true });
  });

  // Positions.

  app.get('/organisation/positions', read, async (request) =>
    ok(await inTenant(options, request, (client) => listPositionRecords(client))),
  );

  app.post('/organisation/positions', { ...write, config: { openapi: { summary: 'POST /organisation/positions', body: positionCreateBody } } }, async (request, reply) => {
    const body = parseInput(positionCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createPosition(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/organisation/positions/:id', { ...write, config: { openapi: { summary: 'PATCH /organisation/positions/:id', body: positionPatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(positionPatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updatePositionRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  app.delete('/organisation/positions/:id', { ...write, config: { openapi: { summary: 'DELETE /organisation/positions/:id' } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    await inTenant(options, request, (client, actor) => deletePosition(client, actor, id));
    return ok({ deleted: true });
  });
}
