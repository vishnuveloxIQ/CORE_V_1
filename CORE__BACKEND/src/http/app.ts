import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import lightMyRequest, { type InjectOptions, type Response as InjectResponse } from 'light-my-request';
import { pino, type DestinationStream, type Logger } from 'pino';
import type { AccessClaims } from '../modules/auth/tokens.js';
import type { RouteDocs } from '../plugins/openapi.js';

/**
 * The HTTP layer: Express 5 runs the server, routing and middleware. This file adapts it to the small route API the
 * modules use (`app.get(path, { preHandler, onRequest, config }, handler)`, hooks, an error handler), so each module
 * keeps one way of declaring a route and the tests keep `app.inject()` (light-my-request, which drives any Node
 * request handler in-process).
 *
 * Request order, for every route:
 *   1. global onRequest hooks (security headers, CORS preflight, rate limit) — before routing, for every request;
 *   2. the route's own onRequest hooks (for example the upload type check), before the body is read;
 *   3. the body is read and parsed (JSON, text, or a registered raw type), within its size limit;
 *   4. the route's preHandler hooks (authentication, privilege, step-up);
 *   5. the handler; its return value is sent as JSON unless it sent a reply itself.
 * Any error thrown at any step goes to the error handler. Static path segments are matched before parameters
 * (`/audit-log/auth-events` before `/audit-log/:id`), whatever order the routes were declared in.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface CoreRequest {
  /** The underlying Express request. */
  readonly raw: Request;
  readonly method: string;
  /** The URL as received, with the query string. */
  readonly url: string;
  readonly headers: IncomingHttpHeaders;
  /** The client address (honours the trusted proxies only). */
  readonly ip: string;
  /** Unique per request; used as the correlation id. */
  readonly id: string;
  readonly log: Logger;
  params: unknown;
  query: unknown;
  body: unknown;
  /** The matched route pattern, for example `/users/:id`. */
  routeOptions: { url?: string };
  /** Set by the authentication pre-handler on protected routes. */
  auth?: AccessClaims;
}

export interface CoreReply {
  readonly raw: Response;
  /** True once a response has been sent. */
  readonly sent: boolean;
  readonly statusCode: number;
  code(status: number): CoreReply;
  header(name: string, value: string): CoreReply;
  getHeader(name: string): string | number | string[] | undefined;
  removeHeader(name: string): CoreReply;
  type(contentType: string): CoreReply;
  /** Objects are sent as JSON, strings as text, Buffers as bytes; nothing sends an empty body. */
  send(payload?: unknown): CoreReply;
}

export type RequestHook = (request: CoreRequest, reply: CoreReply) => unknown;
export type RouteHandler = (request: CoreRequest, reply: CoreReply) => unknown;

export interface RouteOptions {
  preHandler?: RequestHook | readonly RequestHook[] | undefined;
  onRequest?: RequestHook | readonly RequestHook[] | undefined;
  config?: { openapi?: RouteDocs | undefined } | undefined;
}

/** What an onRoute hook receives for each declared route. */
export interface RouteInfo {
  method: HttpMethod;
  url: string;
  config?: RouteOptions['config'] | undefined;
}

/** An error with an optional HTTP status (4xx statuses are client errors; anything else is a server error). */
export interface HttpError extends Error {
  statusCode?: number;
}

export type ErrorHandler = (error: HttpError, request: CoreRequest, reply: CoreReply) => unknown;

type ContentParser = (request: CoreRequest, body: Buffer, done: (error: Error | null, value?: unknown) => void) => void;

type RouteMethod = {
  (path: string, handler: RouteHandler): void;
  (path: string, options: RouteOptions, handler: RouteHandler): void;
};

export interface CoreApp {
  readonly log: Logger;
  get: RouteMethod;
  post: RouteMethod;
  put: RouteMethod;
  patch: RouteMethod;
  delete: RouteMethod;
  addHook(name: 'onRequest', hook: RequestHook): void;
  addHook(name: 'onRoute', hook: (route: RouteInfo) => void): void;
  setErrorHandler(handler: ErrorHandler): void;
  setNotFoundHandler(handler: RouteHandler): void;
  addContentTypeParser(types: readonly string[], options: { parseAs: 'buffer'; bodyLimit: number }, parser: ContentParser): void;
  /** Sends a request to the app in-process (tests and scripts). */
  inject(options: InjectOptions | string): Promise<InjectResponse>;
  /** Starts listening; resolves with the address. */
  listen(options: { host: string; port: number }): Promise<string>;
  /** Freezes the route table. Called on first use; routes cannot be added after it. */
  ready(): Promise<void>;
  close(): Promise<void>;
}

export interface CreateAppOptions {
  logger: { level: string; redact: { paths: string[]; censor: string }; stream?: { write(line: string): void } | undefined };
  /** Addresses or ranges allowed to set X-Forwarded-For, or false to trust none. */
  trustProxy: string[] | false;
  /** Largest JSON or text body, in bytes. */
  bodyLimit?: number;
}

/** The default largest body: 1 MiB. */
/** A request ID the client may send: 8 to 64 letters, digits, dots, underscores or hyphens. */
const CLIENT_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export const DEFAULT_BODY_LIMIT = 1_048_576;

const httpError = (statusCode: number, message: string): HttpError => Object.assign(new Error(message), { statusCode });
const asArray = <T>(value: T | readonly T[] | undefined): readonly T[] =>
  value === undefined ? [] : Array.isArray(value) ? (value as readonly T[]) : [value as T];
const mediaTypeOf = (header: string | undefined) => (header ?? '').split(';')[0]!.trim().toLowerCase();

/** Copies the methods of an object's own class onto the object, so they survive a prototype swap. */
function pinOwnMethods(target: object): void {
  const proto = Object.getPrototypeOf(target) as object;
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor' || Object.prototype.hasOwnProperty.call(target, name)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    if (typeof descriptor?.value === 'function') {
      Object.defineProperty(target, name, { value: (descriptor.value as (...args: unknown[]) => unknown).bind(target), writable: true, configurable: true });
    }
  }
}

/** Reads the whole body, refusing it with 413 once it passes `limit`. Resolves undefined when there is none. */
function readRaw(req: Request, limit: number): Promise<Buffer | undefined> {
  const declared = req.headers['content-length'];
  if (declared === undefined && req.headers['transfer-encoding'] === undefined) return Promise.resolve(undefined);
  if (declared !== undefined && Number(declared) > limit) return Promise.reject(httpError(413, 'Request body is too large'));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on('end', () => (tooLarge ? reject(httpError(413, 'Request body is too large')) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

export function createApp(options: CreateAppOptions): CoreApp {
  const log = pino(
    { level: options.logger.level, redact: options.logger.redact },
    options.logger.stream as DestinationStream | undefined,
  );
  const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
  const server = express();
  server.disable('x-powered-by');
  server.disable('etag');
  server.set('trust proxy', options.trustProxy === false ? false : options.trustProxy);

  const onRequestHooks: RequestHook[] = [];
  const onRouteHooks: Array<(route: RouteInfo) => void> = [];
  const parsers = new Map<string, { bodyLimit: number; parser: ContentParser }>();
  const routes: Array<{ method: HttpMethod; path: string; options: RouteOptions; handler: RouteHandler }> = [];
  const contexts = new WeakMap<Request, { request: CoreRequest; reply: CoreReply }>();
  let errorHandler: ErrorHandler = (_error, _request, reply) => void reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  let notFoundHandler: RouteHandler = (_request, reply) => void reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  let frozen = false;
  let counter = 0;
  let listening: Server | undefined;

  function makeReply(res: Response): CoreReply {
    let sent = false;
    const reply: CoreReply = {
      raw: res,
      get sent() {
        return sent || res.headersSent;
      },
      get statusCode() {
        return res.statusCode;
      },
      code(status) {
        res.statusCode = status;
        return reply;
      },
      header(name, value) {
        res.setHeader(name, value);
        return reply;
      },
      getHeader: (name) => res.getHeader(name),
      removeHeader(name) {
        res.removeHeader(name);
        return reply;
      },
      type(contentType) {
        res.setHeader('Content-Type', contentType);
        return reply;
      },
      send(payload) {
        if (reply.sent) return reply;
        sent = true;
        let body: string | Buffer | undefined;
        const typed = res.getHeader('Content-Type') !== undefined;
        if (payload === undefined || payload === null) body = undefined;
        else if (Buffer.isBuffer(payload)) {
          if (!typed) res.setHeader('Content-Type', 'application/octet-stream');
          body = payload;
        } else if (typeof payload === 'string') {
          if (!typed) res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          body = payload;
        } else {
          if (!typed) res.setHeader('Content-Type', 'application/json; charset=utf-8');
          body = JSON.stringify(payload);
        }
        if (body !== undefined) res.setHeader('Content-Length', Buffer.byteLength(body));
        res.end(body);
        return reply;
      },
    };
    return reply;
  }

  function makeRequest(req: Request, id: string): CoreRequest {
    return {
      raw: req,
      method: req.method,
      get url() {
        return req.originalUrl;
      },
      headers: req.headers,
      get ip() {
        return req.ip ?? req.socket.remoteAddress ?? '';
      },
      id,
      log: log.child({ reqId: id }),
      params: {},
      get query() {
        return req.query;
      },
      body: undefined,
      routeOptions: {},
    };
  }

  async function handleError(error: unknown, request: CoreRequest, reply: CoreReply) {
    const err = (error instanceof Error ? error : new Error(String(error))) as HttpError;
    if (reply.sent) {
      request.log.error({ err }, 'error after the response was sent');
      return;
    }
    try {
      await errorHandler(err, request, reply);
    } catch (inner) {
      request.log.error({ err: inner }, 'error handler failed');
    }
    if (!reply.sent) reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }

  /** The body for the route: a registered raw type, JSON, text, or nothing. */
  async function parseBody(request: CoreRequest): Promise<unknown> {
    const type = mediaTypeOf(request.headers['content-type']);
    const custom = parsers.get(type);
    const raw = await readRaw(request.raw, custom?.bodyLimit ?? bodyLimit);
    if (raw === undefined) return undefined;
    if (custom) {
      return new Promise((resolve, reject) => custom.parser(request, raw, (err, value) => (err ? reject(err) : resolve(value))));
    }
    if (type === 'application/json' || type.endsWith('+json')) {
      if (raw.length === 0) throw httpError(400, "Body cannot be empty when content-type is set to 'application/json'");
      try {
        return JSON.parse(raw.toString('utf8')) as unknown;
      } catch {
        throw httpError(400, 'Body is not valid JSON');
      }
    }
    if (type === 'text/plain') return raw.toString('utf8');
    if (raw.length === 0) return undefined;
    throw httpError(415, `Unsupported Media Type: ${type || 'none'}`);
  }

  // Before routing: the request facade, request logging and the global onRequest hooks.
  server.use(async (req: Request, res: Response, next: NextFunction) => {
    // A client may name the request (X-Request-Id) so a support report can be matched to the logs; anything that
    // is not a short plain token is ignored, so the header can never inject text into the logs.
    const sent = req.headers['x-request-id'];
    const id = typeof sent === 'string' && CLIENT_REQUEST_ID.test(sent) ? sent : `req-${(++counter).toString(36)}`;
    res.setHeader('X-Request-Id', id);
    const request = makeRequest(req, id);
    const reply = makeReply(res);
    contexts.set(req, { request, reply });
    const started = process.hrtime.bigint();
    request.log.info(
      { req: { method: req.method, url: req.originalUrl, host: req.headers.host, remoteAddress: req.socket.remoteAddress } },
      'incoming request',
    );
    res.on('finish', () =>
      request.log.info({ res: { statusCode: res.statusCode }, responseTime: Number(process.hrtime.bigint() - started) / 1e6 }, 'request completed'),
    );
    try {
      for (const hook of onRequestHooks) {
        await hook(request, reply);
        if (reply.sent) return;
      }
      next();
    } catch (err) {
      await handleError(err, request, reply);
    }
  });

  /**
   * A total order on route paths, segment by segment: a static segment before a parameter, two static segments by
   * text, two parameters as equal; a shorter path before a longer one. Routes that can match the same URL then
   * meet the static one first; identical patterns keep their declaration order (the sort is stable).
   */
  const bySpecificity = (a: { path: string }, b: { path: string }) => {
    const sa = a.path.split('/');
    const sb = b.path.split('/');
    for (let i = 0; i < Math.min(sa.length, sb.length); i += 1) {
      const pa = sa[i]!.startsWith(':');
      const pb = sb[i]!.startsWith(':');
      if (pa !== pb) return pa ? 1 : -1;
      if (!pa && sa[i] !== sb[i]) return sa[i]! < sb[i]! ? -1 : 1;
    }
    return sa.length - sb.length;
  };

  function freeze() {
    if (frozen) return;
    frozen = true;
    for (const route of [...routes].sort(bySpecificity)) {
      const onRequest = asArray(route.options.onRequest);
      const preHandler = asArray(route.options.preHandler);
      const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
      server[method](route.path, async (req: Request) => {
        const { request, reply } = contexts.get(req)!;
        request.params = { ...req.params };
        request.routeOptions.url = route.path;
        try {
          for (const hook of onRequest) {
            await hook(request, reply);
            if (reply.sent) return;
          }
          request.body = await parseBody(request);
          for (const hook of preHandler) {
            await hook(request, reply);
            if (reply.sent) return;
          }
          const result = await route.handler(request, reply);
          if (!reply.sent) reply.send(result);
        } catch (err) {
          await handleError(err, request, reply);
        }
      });
    }
    server.use(async (req: Request) => {
      const { request, reply } = contexts.get(req)!;
      try {
        await notFoundHandler(request, reply);
      } catch (err) {
        await handleError(err, request, reply);
      }
    });
  }

  const register = (method: HttpMethod) =>
    ((path: string, optionsOrHandler: RouteOptions | RouteHandler, maybeHandler?: RouteHandler) => {
      if (frozen) throw new Error(`Route ${method} ${path} was added after the app started`);
      const [routeOptions, handler] =
        typeof optionsOrHandler === 'function' ? [{} as RouteOptions, optionsOrHandler] : [optionsOrHandler, maybeHandler!];
      routes.push({ method, path, options: routeOptions, handler });
      for (const hook of onRouteHooks) hook({ method, url: path, config: routeOptions.config });
    }) as RouteMethod;

  const app: CoreApp = {
    log,
    get: register('GET'),
    post: register('POST'),
    put: register('PUT'),
    patch: register('PATCH'),
    delete: register('DELETE'),
    addHook(name: 'onRequest' | 'onRoute', hook: RequestHook | ((route: RouteInfo) => void)) {
      if (name === 'onRequest') onRequestHooks.push(hook as RequestHook);
      else onRouteHooks.push(hook as (route: RouteInfo) => void);
    },
    setErrorHandler(handler) {
      errorHandler = handler;
    },
    setNotFoundHandler(handler) {
      notFoundHandler = handler;
    },
    addContentTypeParser(types, parserOptions, parser) {
      for (const type of types) parsers.set(type.toLowerCase(), { bodyLimit: parserOptions.bodyLimit, parser });
    },
    async inject(injectOptions) {
      freeze();
      return lightMyRequest((req, res) => {
        // Express swaps the request and response prototypes for its own, which would drop the methods
        // light-my-request overrides to feed the body in and capture the reply. Pin them on the objects first.
        pinOwnMethods(req);
        pinOwnMethods(res);
        server(req as Request, res as Response);
      }, injectOptions as InjectOptions);
    },
    async listen({ host, port }) {
      freeze();
      const httpServer = createServer(server);
      await new Promise<void>((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => resolve());
      });
      listening = httpServer;
      const address = httpServer.address();
      const url = typeof address === 'string' ? address : `http://${address?.address}:${address?.port}`;
      log.info(`Server listening at ${url}`);
      return url;
    },
    async ready() {
      freeze();
    },
    async close() {
      const current = listening;
      listening = undefined;
      if (current) await new Promise<void>((resolve) => current.close(() => resolve()));
    },
  };
  return app;
}
