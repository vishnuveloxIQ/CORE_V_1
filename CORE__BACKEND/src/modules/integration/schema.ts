import { z } from 'zod';

export const EVENT_DIRECTIONS = ['outbound', 'inbound'] as const;
export const EVENT_STATUSES = ['pending', 'published', 'received', 'processed', 'dead_lettered'] as const;

/** GET /integration-events: newest first, filtered on the server, paged. */
export const eventListQuery = z
  .object({
    direction: z.enum(EVENT_DIRECTIONS).optional(),
    status: z.enum(EVENT_STATUSES).optional(),
    eventType: z.string().trim().min(1).max(100).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, { message: 'from must not be after to', path: ['from'] });

/** POST /integration-events/inbound: one event from a source module, in the versioned envelope. */
export const inboundEventBody = z
  .object({
    eventId: z.uuid(),
    eventType: z.string().trim().min(1).max(100),
    eventVersion: z.string().trim().min(1).max(20),
    schemaVersion: z.string().trim().min(1).max(20),
    aggregateType: z.string().trim().min(1).max(60).regex(/^[a-z_]+$/, 'lower-case words joined by underscores'),
    aggregateId: z.uuid(),
    aggregateSeq: z.number().int().min(1),
    occurredAt: z.iso.datetime(),
    sourceModule: z.enum(['hrms', 'pm', 'pms', 'stores']),
    correlationId: z.string().trim().min(1).max(100).nullable().optional(),
    causationId: z.uuid().nullable().optional(),
    // the record's fields as the source module publishes them; unknown fields are kept as they are
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

/** POST /integration-events/{id}/replay. */
export const replayBody = z.object({}).strict();

export type EventListQuery = z.infer<typeof eventListQuery>;
export type InboundEventInput = z.infer<typeof inboundEventBody>;
