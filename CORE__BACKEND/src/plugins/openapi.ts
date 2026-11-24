import type { CoreApp, RouteInfo } from '../http/app.js';
import { z, type ZodType } from 'zod';

/**
 * GET /openapi.json (Phase N, design default c). The document is built from the routes the app registers,
 * through an onRoute hook, so it cannot drift from the code.
 *
 * A route can describe its input with `config.openapi`: the Zod schema for the JSON body and for the query
 * string, and a summary. The document converts those schemas to JSON Schema. Documentation only: request
 * validation stays in the handlers (parseInput), so nothing about how a request is checked changes.
 */

/** What a route documents about its input. Filled in with guardRoute's third argument or route config. */
export interface RouteDocs {
  summary?: string;
  body?: ZodType;
  query?: ZodType;
  /** A raw (non-JSON) request body, described in words: the body is the file's bytes. */
  rawBody?: string;
}

/** Routes that answer without a bearer token. Everything else requires one. */
export const PUBLIC_OPERATIONS = new Set([
  'GET /health',
  'GET /health/ready',
  'GET /openapi.json',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/password-reset/request',
  'POST /auth/password-reset/confirm',
  'POST /auth/passkeys/login/options',
  'POST /auth/passkeys/login/verify',
  // Answers 501 until Phase 4 sync exists; it takes no token today.
  'POST /offline-operations',
]);

const METHODS_SKIPPED = new Set(['HEAD', 'OPTIONS']);

/**
 * Writes that need an Idempotency-Key header. Every POST and PATCH in the module routes runs through
 * inTenant, which requires it; PUT /files/:id/content runs through the same store. The auth routes and
 * POST /offline-operations do not: they return tokens or secrets, which must not be stored in
 * integ_idempotency_key (decision 1).
 */
export function requiresIdempotencyKey(method: string, path: string): boolean {
  if (method !== 'POST' && method !== 'PATCH' && method !== 'PUT') {
    return false;
  }
  return !(path.startsWith('/auth/') || path === '/offline-operations');
}

const IDEMPOTENCY_KEY_HEADER = {
  name: 'Idempotency-Key',
  in: 'header' as const,
  required: true as const,
  description:
    'Unique per write, 1 to 255 characters. A repeat with the same key and body replays the first response for 24 hours. The same key with a different body is refused with 409 (IDEMPOTENCY_KEY_REUSED).',
  schema: { type: 'string' as const, maxLength: 255 },
};

const ERROR_RESPONSES = {
  '400': {
    description:
      'Validation failed (VALIDATION_ERROR), or a missing Idempotency-Key (IDEMPOTENCY_KEY_REQUIRED)',
  },
  '401': { description: 'Missing, malformed or invalid token (AUTH_REQUIRED)' },
  '403': { description: 'Missing privilege (ACCESS_DENIED)' },
  '404': { description: 'Not found in this tenant (NOT_FOUND)' },
  '409': { description: 'Conflict or version mismatch (VERSION_CONFLICT, CONFLICT)' },
  '429': { description: 'Rate limited (RATE_LIMITED)' },
  '500': { description: 'Internal error (INTERNAL_ERROR)' },
} as const;

export interface OpenApiParameter {
  name: string;
  in: 'path' | 'header' | 'query';
  required: boolean;
  description?: string;
  schema: Record<string, unknown>;
}

export interface OpenApiOperation {
  operationId: string;
  summary?: string;
  tags?: string[];
  parameters: OpenApiParameter[];
  requestBody?: {
    required: boolean;
    description?: string;
    content: Record<string, { schema: Record<string, unknown> }>;
  };
  security?: Array<Record<string, string[]>>;
  responses: Record<string, { description: string }>;
}

export type OpenApiPaths = Record<string, Record<string, OpenApiOperation>>;

/** Turns an Express route path (":id") into an OpenAPI path ("{id}"). */
export function toOpenApiPath(url: string): string {
  return url.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function operationIdFor(method: string, path: string): string {
  const words = path
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) =>
      part.replace(/[{}]/g, '').replace(/[^A-Za-z0-9]+(.)/g, (_m, c: string) => c.toUpperCase()),
    );
  const head = method.toLowerCase();
  const body = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
  return `${head}${body || 'Root'}`;
}

/** A Zod schema as the JSON Schema an OpenAPI document holds. Schemas Zod cannot express become "any". */
export function jsonSchemaOf(schema: ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  // the draft marker belongs to a standalone schema, not to one inside an OpenAPI document
  delete json['$schema'];
  return json;
}

/** One query parameter per field of the query object schema. */
function queryParameters(schema: ZodType): OpenApiParameter[] {
  const json = jsonSchemaOf(schema);
  const properties = (json['properties'] ?? {}) as Record<string, Record<string, unknown>>;
  const required = (json['required'] ?? []) as string[];
  return Object.entries(properties).map(([name, field]) => ({
    name,
    in: 'query' as const,
    required: required.includes(name),
    schema: field,
  }));
}

/** The tag that groups a route in Swagger: its first path segment ("/approval-requests/:id" → "approval-requests"). */
function tagFor(path: string): string {
  return path.split('/').find((part) => part.length > 0) ?? 'root';
}

/** Builds one operation from a route, its documented input, and whether it is public. */
export function operationFor(method: string, path: string, docs?: RouteDocs): OpenApiOperation {
  const parameters: OpenApiParameter[] = [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(
    (match) => ({
      name: match[1]!,
      in: 'path' as const,
      required: true,
      schema: { type: 'string' },
    }),
  );
  if (docs?.query) {
    parameters.push(...queryParameters(docs.query));
  }
  const isPublic = PUBLIC_OPERATIONS.has(`${method} ${path}`);
  if (requiresIdempotencyKey(method, path)) {
    parameters.push(IDEMPOTENCY_KEY_HEADER);
  }
  const responses: Record<string, { description: string }> = {
    '200': { description: 'Success: { data, meta? }' },
    ...ERROR_RESPONSES,
  };
  const operation: OpenApiOperation = {
    operationId: operationIdFor(method, path),
    tags: [tagFor(path)],
    parameters,
    responses,
  };
  if (docs?.summary) {
    operation.summary = docs.summary;
  }
  if (docs?.body) {
    operation.requestBody = {
      required: true,
      content: { 'application/json': { schema: jsonSchemaOf(docs.body) } },
    };
  } else if (docs?.rawBody) {
    operation.requestBody = {
      required: true,
      description: docs.rawBody,
      content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
    };
  }
  if (isPublic) {
    // Public operations do not carry the 401 response.
    delete responses['401'];
  } else {
    operation.security = [{ bearerAuth: [] }];
  }
  return operation;
}

/** Registers the collector and GET /openapi.json. Call before any other route is registered. */
export function registerOpenApi(app: CoreApp, info: { version: string }): void {
  const paths: OpenApiPaths = {};

  app.addHook('onRoute', (route: RouteInfo) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const path = toOpenApiPath(route.url);
    for (const method of methods) {
      if (METHODS_SKIPPED.has(method)) {
        continue;
      }
      const entry = paths[path] ?? {};
      const docs = (route.config as { openapi?: RouteDocs } | undefined)?.openapi;
      entry[method.toLowerCase()] = operationFor(method, path, docs);
      paths[path] = entry;
    }
  });

  app.get('/openapi.json', async () => ({
    openapi: '3.1.0',
    info: { title: 'VeloxIQ Core API', version: info.version },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    paths,
  }));
}
