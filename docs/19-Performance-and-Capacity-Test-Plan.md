# VeloxIQ Core: Performance and Capacity Test Plan

| Field | Value |
|---|---|
| Document ID | DOC-19 |
| Title | Performance and Capacity Test Plan |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Internal |

> **No performance results exist yet in this document.** All result tables below are empty. The repository has a local baseline script (section 4) and `SCHEDULE-STATUS.md` (item CORE-27-05) records a local run as "Partial", but no staging or production-like run has been done: staging does not exist yet (blocker B1 in `SCHEDULE-STATUS.md`). All thresholds, workloads and volumes in this plan are **Proposed** unless a repository source is cited.

## 1. Purpose

Describe how VeloxIQ Core will be tested for performance and capacity: what to measure, with which workload, in which environment, against which thresholds, and how results will be reported and turned into capacity decisions.

## 2. Scope

| In scope | Out of scope |
|---|---|
| HTTP API of `CORE__BACKEND` (Fastify 5, Node 24) on PostgreSQL 18 | Browser rendering performance of `CORE__FRONTEND` (separate front-end test, To be confirmed) |
| Schema-per-tenant behaviour with many tenant schemas | Other modules calling CORE (HRMS, PMS), except inbound event calls |
| Outbox relay and approval reminder sweep as background load | Penetration and security testing (see [08 Test Strategy and Quality Plan](08-Test-Strategy-and-Quality-Plan.md)) |
| Non-production environments only | Any run against production |

Related documents: [02 System Architecture](02-System-Architecture.md), [08 Test Strategy and Quality Plan](08-Test-Strategy-and-Quality-Plan.md), [09 Operations Runbook](09-Operations-Runbook-and-Support-Model.md), [10 BC/DR Plan](10-Business-Continuity-and-Disaster-Recovery-Plan.md), [17 Service Catalogue and SLA](17-Service-Catalogue-and-SLA.md).

## 3. Objectives

| # | Objective | Evidence of success |
|---|---|---|
| O1 | Establish a repeatable baseline of latency, throughput and errors for key transactions | Baseline table (section 12) filled and archived |
| O2 | Verify the provisional targets of decision D19 on a staging-class environment | D19 targets met or revised with evidence |
| O3 | Find the saturation point (users, requests per second) and the first bottleneck | Stress test report |
| O4 | Prove stability over a long period (no leaks, no pool exhaustion, no unbounded growth beyond plan) | Soak test report |
| O5 | Show behaviour with many tenant schemas (queries, migrations, relay sweep) | Tenant-scale report |
| O6 | Provide inputs for capacity planning and the availability option in [17](17-Service-Catalogue-and-SLA.md) | Section 13 factors measured |
| O7 | Confirm graceful degradation (429 and 503 behave as designed, no data corruption) | Spike and stress test observations |

Existing provisional targets (decision D19, `SCHEDULE-STATUS.md`, decided 2026-11-22 under delegation, provisional): at 50 concurrent users on staging, p95 latency at most 500 ms for reads and 1,000 ms for writes, sign-in at most 1,500 ms, error rate below 1%, no pool exhaustion. Outbox lag has no target until decision D13 is made. D19 is to be confirmed after the first load run.

## 4. The existing load baseline script

### 4.1 Location and command

| Item | Value |
|---|---|
| Script | `CORE__BACKEND/scripts/load-baseline.ts` |
| npm script | `load:baseline` in `CORE__BACKEND/package.json`: `node --env-file-if-exists=.env --import tsx scripts/load-baseline.ts` |
| Invocation | `npm run load:baseline -- [concurrency=50] [requests=400] [out=evidence.json]` |
| Purpose (from script header) | A local performance baseline (tasks CORE-27-05 and 27-06). It is explicitly not the staging load test |

### 4.2 Parameters

| Position | Name | Default | Meaning |
|---|---|---|---|
| 1 | concurrency | 50 | Number of parallel workers per workload |
| 2 | requests | 400 | Requests per workload (the sign-in workload is capped, see below) |
| 3 | out | none | Optional file path; if given, a JSON summary is written |

Environment: it reads `DATABASE_URL` through `loadEnv()` (`src/config/env.ts`) and the optional `.env` file (the file contents are not documented here and must never be pasted into reports). If `DATABASE_URL` is unset the script throws.

### 4.3 What it does, step by step

| Step | Action | Source lines |
|---|---|---|
| 1 | Creates a fresh throwaway database with one tenant, `acme`, using `createTestDatabase(env.DATABASE_URL, ['acme'])` from `tests/db/helpers.js`; the header says it never touches dev data | `load-baseline.ts` 52-54 |
| 2 | Builds the real app (`buildApp`) with `NODE_ENV=test`, silent logging, a random JWT secret, `SESSION_DEVICE_LIMIT=100` and the global rate limit raised to 1,000,000 per 60 s | 55 |
| 3 | Listens on `127.0.0.1` with an ephemeral port (local HTTP, real server) | 57-58 |
| 4 | Inserts 20 fictional users (`LOAD1000` to `LOAD1019`), one argon2 hash of a fixed fictional password, status active | 59-63 |
| 5 | Grants user `LOAD1000` the privilege `projects.manage` | 64 |
| 6 | Signs in `LOAD1000` and creates 300 fixture projects through `POST /projects` with idempotency keys | 70-75 |
| 7 | Runs five workloads one after another (table below) | 78-83 |
| 8 | Enqueues 1,000 outbox events across 100 aggregates and drains them with 4 parallel `relayTenant` calls (batch 1000) through `MockPublisher`; reports events, seconds and per-second | 85-96 |
| 9 | Reads connection pool counters (total, idle, waiting) | 98 |
| 10 | Prints a table, prints relay and pool counters, optionally writes JSON | 99-102 |
| 11 | In `finally`: closes the app and drops the throwaway database | 103-106 |

### 4.4 Workloads measured

| Workload | Request | Concurrency | Requests | Success rule |
|---|---|---|---|---|
| sign-in (password) | `POST /auth/login` with header `x-tenant-id: acme` | min(concurrency, 20) | min(requests, 100) | HTTP OK and token returned |
| GET /projects (300 rows) | `GET /projects` | concurrency | requests | HTTP OK |
| GET /search?q=highway | `GET /search?q=highway` | concurrency | requests | HTTP OK |
| POST /projects (write) | `POST /projects` with unique code and idempotency key | concurrency | requests | HTTP 201 |
| GET /health/ready | `GET /health/ready` | concurrency | requests | HTTP OK |
| Outbox relay | 1,000 events, 4 parallel relay workers | 4 | 1,000 events | Counted as events sent |

### 4.5 Output metrics

Per workload: requests, concurrency, errors, seconds, requests per second, p50, p95, p99 and max latency in milliseconds (computed by the `pct` function on sorted per-request times). The JSON summary also records `ranAt`, `where` ("local machine, HTTP server and PostgreSQL on localhost (not staging)"), Node version, the relay result and the pool counters after the run.

### 4.6 Limits of the baseline (what it does not cover)

| Limit | Consequence |
|---|---|
| Single tenant, 300 projects, 20 users | No tenant-scale or data-volume effect |
| Load generator, server and database on one machine | Client and server compete for CPU; numbers are optimistic or noisy |
| Global rate limit disabled (1,000,000) and device limit 100 | Does not test throttling or session limits |
| Sign-in capped at 100 requests and concurrency 20 | Sign-in is lightly exercised; also protected in production by per-login limits (section 9) |
| No plan-line, equipment, audit-log, bulk-upload, file-upload or inbound-event workloads | Covered by the proposed model in section 5 |
| Relay measured with a mock transport | No real network publish latency |
| Pool is created by the test helper (`tests/db/helpers.ts`, size not verified here), not necessarily the server default of 10 | Verify pool behaviour separately (section 8) |
| Run is one-shot, no ramp, no soak | Use section 6 test types |

### 4.7 Running it safely (non-production only)

| Rule | Detail |
|---|---|
| Never run against production | The script creates and drops a database and signs in 20 users with a fixed fictional password. Production credentials in `DATABASE_URL` must never be used |
| Use a dedicated non-production PostgreSQL server | Point `DATABASE_URL` at a server where the account may create and drop databases and where no business data lives. Confirm the target host before running |
| Do not paste or commit `.env` | Supply `DATABASE_URL` through the process environment for the session; do not record it in reports |
| Check the target | Echo only the host name (not credentials) in the run log; confirm it matches the approved test host |
| Example (illustrative, do not execute from this document) | `npm run load:baseline -- 50 400 <output-path>.json` from `CORE__BACKEND` |

The baseline is a smoke-level local tool. The staged tests below require a purpose-built load tool (To be confirmed; see open items).

## 5. Workload model (Proposed)

All volumes are placeholders until the business supplies real figures (Open items).

### 5.1 User and tenant assumptions (Proposed)

| Parameter | Proposed starting value | Source |
|---|---|---|
| Concurrent users per tenant at peak | 50 (matches D19 reference point) | `SCHEDULE-STATUS.md` D19 |
| Tenants active during a test | 1 for load tests; 10, 50, 200 for tenant-scale | Proposed |
| Think time between actions | 3 to 10 seconds per user | Proposed |
| Read to write ratio | 80% reads, 20% writes | Proposed |
| Test duration at steady state | 30 minutes (load), 4 to 8 hours (soak) | Proposed |
| Production traffic volumes | To be confirmed | Open item |

### 5.2 Key transactions

| ID | Transaction | Endpoint (evidence) | Type | Share of mix (Proposed) | Notes |
|---|---|---|---|---|---|
| T1 | Sign-in | `POST /auth/login` (`src/modules/auth/routes.ts`) | Write (session row, argon2id verify) | 3% | CPU heavy hashing; limited per IP and per login id |
| T2 | Token refresh | Auth module refresh route | Write | 2% | Uses unique index `core_user_session_refresh_hash_key` (migration 0033) |
| T3 | List page, small | `GET /projects`, other master lists with `limit` default | Read | 25% | |
| T4 | List page, maximum paging | Same lists with `limit=200` and varying `offset` | Read | 8% | Maximum page size is 200 (`src/modules/audit-log/schema.ts`; confirm per module) |
| T5 | Plan line list and filter | `GET /plan-lines` (`src/modules/masters/routes.ts`) | Read | 10% | |
| T6 | Plan line save | `POST /plan-lines`, `PATCH /plan-lines/:id` | Write (row version, audit row) | 10% | Each write also appends to `audit_row_change` |
| T7 | Equipment register list | `GET /equipment-units` (`src/modules/equipment-units/routes.ts`) | Read | 10% | Indexes on type, location, vendor (migration 0022) |
| T8 | Audit log list and filter | `GET /audit-log`, `GET /audit-log/auth-events` | Read | 5% | Requires `access.manage`; descending indexes from migration 0033 |
| T9 | Search | `GET /search?q=` (`src/modules/search`) | Read | 8% | Search implementation and indexes: To be confirmed |
| T10 | Approvals inbox and action | Approvals module routes | Read and write | 6% | Index on status and raised_at (migration 0033) |
| T11 | Bulk upload | Repeated `POST /import-batches/:id/rows` then `POST /import-batches/:id/submit` (`src/modules/records/routes.ts`) | Write | 3% of users, many requests each | Row-by-row requests; a batch of N rows costs N+ requests; counts against rate limit |
| T12 | File upload | `POST /files` and content upload up to 2 MB (`FILE_CONTENT_MAX_BYTES` in `src/modules/records/rules.ts`) | Write, large body | 2% | Stored in the database (`core_file`, migration 0015, To be confirmed: storage location); also test file download `GET /files/:id/content` |
| T13 | Event inbound | `POST /integration-events/inbound` (`src/modules/integration/routes.ts`) | Write | 5% | Requires `access.manage` user; also test `POST /audit-log` external entry route if exposed |
| T14 | Health probes | `GET /health`, `GET /health/ready` | Read | Background, 1 per 10 s | Exempt from rate limit |

Mix percentages for T1 to T13 sum to 97% (3+2+25+8+10+10+10+5+8+6+3+2+5); the remaining 3% is Proposed for miscellaneous lookups. Adjust when real usage data is available.

### 5.3 Background load during tests

The approval reminder sweep (`startReminderSchedule` in `src/server.ts`, every `APPROVAL_REMINDER_MINUTES`, default 15) and the outbox relay (`src/core/relay.ts`) run in the server process and form background load.

### 5.4 Data volume profiles (Proposed, synthetic)

| Profile | Rows in largest master list | Plan lines | Audit rows | Tenants |
|---|---|---|---|---|
| Small | 300 (as baseline) | 5,000 | 50,000 | 1 |
| Medium | 5,000 | 50,000 | 1,000,000 | 10 |
| Large | 50,000 | 500,000 | 10,000,000 | 50 |
| Tenant-scale | Small per tenant | 5,000 per tenant | 50,000 per tenant | 200 and more |

## 6. Test types

| Type | Goal | Load shape (Proposed) | Duration | Pass signal |
|---|---|---|---|---|
| Baseline | Reference numbers on target environment, single user and low concurrency | 1, 5, 10 users | 10 minutes each | Latencies recorded; no errors |
| Load | Verify targets at expected peak | Ramp to 50 users per tenant in 10 minutes, hold | 30 minutes hold | Thresholds in section 7 met |
| Stress | Find breaking point and bottleneck | Step up every 5 minutes (50, 100, 150, 200, ...) until errors above 5% or p95 above 5 times target | Until failure | Failure mode is graceful (429 or 503, no corruption); recovery after load drops |
| Soak (endurance) | Detect leaks and growth | Constant 50% of peak | 4 to 8 hours (Proposed; longer if possible) | Flat memory, stable latency, no pool waiting, no error drift |
| Spike | Behaviour on sudden surge | 10 to 100 users within 30 seconds, hold 5 minutes, drop | 20 minutes | Recovery within 2 minutes after the spike |
| Tenant-scale | Behaviour with many schemas | Create synthetic tenants (10, 50, 200, 500); run load on 1 or several; time readiness, relay sweep and migrations | Per step | Relay sweep time, migration time and query latency stay within limits |
| Bulk and file | Large batches and 2 MB uploads | Batches of 1,000 rows; 20 concurrent 2 MB uploads | 15 minutes | No timeouts, memory stable |
| Failover and recovery (optional) | Behaviour when database restarts | Restart database during load in a test environment | 10 minutes | Readiness returns 503 then 200; connections recover |

Entry criteria: build deployed and smoke-tested, synthetic data loaded, monitoring running, rate-limit configuration agreed (section 9), test window agreed. Exit criteria: all planned runs complete, results archived, defects raised.

## 7. Metrics and acceptance thresholds

### 7.1 Metrics to collect

| Category | Metric | Source |
|---|---|---|
| Client side | Throughput (requests per second), latency p50, p95, p99, max, error rate by status code (4xx, 5xx, 429), timeouts | Load tool; baseline script output |
| Application | Process CPU, memory (RSS and heap), event loop lag, open handles, log error counts | OS tools, Node diagnostics; logs (pino) |
| Database | Active and waiting connections, pool waiting count, slow queries, lock waits, cache hit ratio, table and index sizes, WAL volume, checkpoint activity | PostgreSQL statistics views; `pg_stat_statements` if enabled (To be confirmed) |
| Background | Outbox pending count and age, relay duration per sweep, dead-letter count | Tenant tables (`0039_event_relay.sql`); relay logs |
| Infrastructure | CPU, memory, disk IO and latency, network | Host monitoring (To be confirmed) |

### 7.2 Proposed acceptance thresholds

The D19 values are the existing provisional decision; other rows are Proposed.

| Metric | Threshold | Origin |
|---|---|---|
| Read p95 at 50 concurrent users | At most 500 ms | D19 (provisional) |
| Write p95 at 50 concurrent users | At most 1,000 ms | D19 (provisional) |
| Sign-in p95 | At most 1,500 ms | D19 (provisional) |
| Error rate (5xx and failed requests, excluding intended 429) | Below 1% | D19 (provisional) |
| Pool exhaustion | None (waiting count returns to 0, no connection timeout errors) | D19 (provisional) |
| p99 read latency | At most 1,500 ms | Proposed |
| Maximum-page list (`limit=200`) p95 | At most 1,000 ms | Proposed |
| File upload (2 MB) p95 | At most 3,000 ms | Proposed |
| Bulk upload: 1,000 rows end to end | At most 10 minutes (with the rate limit adjusted as in section 9) | Proposed |
| CPU on application host during steady state | Below 70% average | Proposed |
| Memory growth during soak | Below 10% from hour 1 to end, no upward trend | Proposed |
| Outbox lag at steady state | To be confirmed (D13 not decided) | Open item |
| Recovery after spike or stress | Latency back within threshold in 2 minutes | Proposed |
| Readiness probe | `/health/ready` always below 500 ms and 200 | Proposed |

## 8. Database considerations

### 8.1 Connection pool

| Fact | Evidence |
|---|---|
| The server creates one pool per process with default `max = 10` | `createPool(env.DATABASE_URL)` in `src/server.ts`; default `max = 10` in `src/db/client.ts` |
| Connection acquisition fails after 5 seconds | `CONNECT_TIMEOUT_MS = 5000` in `src/db/client.ts` |
| Idle connections are closed after 30 seconds | `IDLE_TIMEOUT_MS = 30000` in `src/db/client.ts` |
| Pool size is not an environment variable | `src/config/env.ts` has no pool setting; changing it needs a code change (not done here) |
| Rate limiting also uses the pool (`PostgresRateLimiter`) | `src/app.ts` line 72; `src/core/rate-limit-store.ts` |

Implications: with 10 connections and a transaction held for the length of each request, throughput is bounded by `10 / average transaction time`; at 50 concurrent users requests queue in the pool and show as latency, and beyond 5 seconds of waiting as errors. Stress tests must record `pool.waitingCount` equivalent (database-side waiting connections). The PostgreSQL `max_connections` must exceed the sum of pools across all application instances plus CLI jobs and the relay listener connection (`pool.connect()` for LISTEN in `src/core/relay.ts`, To be confirmed).

### 8.2 Schema-per-tenant implications

| Topic | Implication for testing |
|---|---|
| Tenant resolved from the verified session; `search_path` set per transaction | Cross-tenant data isolation must hold under load (verify no leakage in results of concurrent multi-tenant tests) |
| Migrations apply to every tenant schema (`migrations/` folder, CLAUDE.md conventions) | Release time grows linearly with tenant count; measure at 10, 50, 200, 500 tenants |
| Many schemas increase catalog size (tables and indexes per tenant are roughly the number in `migrations/`) | Measure `pg_class` count, planner time, backup and restore time, and memory of the database |
| Relay and reminder sweeps iterate tenants (`tenantIds` in `src/core/relay.ts`) | Sweep duration scales with tenant count; measure per-sweep time |
| Statement caching and plans are per schema | Cold-start latency for rarely used tenants; include cold tenant requests in the test |
| One noisy tenant can consume the shared pool | Test a hot tenant plus many quiet tenants and observe fairness |
| No `tenant_id` on business tables (CLAUDE.md) | Indexes are per schema and small; effect on cache needs measuring |

### 8.3 Indexes visible in migrations

| Index | Migration | Supports |
|---|---|---|
| `core_user_session_refresh_hash_key` (unique) | `0033_hot_path_indexes.sql` | Token refresh lookup |
| `ix_core_auth_activity_occurred_at` (occurred_at DESC NULLS LAST, id) | `0033` | `GET /audit-log/auth-events` |
| `ix_core_approval_request_status_raised_at` (status, raised_at DESC, code) | `0033` | Approvals inbox |
| `ix_audit_row_change_changed_at_desc` (changed_at DESC NULLS LAST, id) | `0033` | `GET /audit-log` first page |
| `ix_audit_row_change_changed_at` (changed_at) | `0002_audit_append_only.sql` | Date range reads |
| `core_equipment_unit_*_idx` on type, location, vendor | `0022_equipment_units.sql` | Equipment register list and filters |
| `core_project_code_key` and other `lower(code)` unique indexes | `0004_approved_keys_indexes.sql` (approved keys) | Lookups and uniqueness |
| `core_import_row_batch_row_key` (batch_id, row_number) | `0014_records.sql` | Bulk upload rows |

Index gaps to investigate with `EXPLAIN` under the Medium and Large profiles (not yet proven): audit log filtering by actor, table or entity; plan line filters; search; offset paging deep into large tables (offset up to the table size is costly). Evidence of earlier EXPLAIN work: `evidence/sprint-review-2026-11-21/sql/` (referenced in `0033_hot_path_indexes.sql`).

### 8.4 Other database facts

| Fact | Evidence | Test relevance |
|---|---|---|
| `audit_row_change` is append-only with a hash chain; each write appends a row | `src/core/audit.ts`, `0002_audit_append_only.sql` | Write latency includes audit insert and chain lock; test at high write concurrency |
| Idempotency keys are serialised per key via a lock | `src/core/idempotency.ts` (`lockWithinSchema`) | Concurrent retries of the same key serialise; use unique keys in load tests (as the baseline does) |
| Rate limit counters are stored in PostgreSQL | `src/core/rate-limit-store.ts` | Every request adds a database round trip; counts toward pool use |
| No `statement_timeout` or `lock_timeout` found in `src/` or `migrations/` | grep result | Long queries are not cut off; set in test environment and observe |
| No retention or archival job found for audit or auth activity tables | grep result | Growth is unbounded (section 13) |

## 9. Rate limits and how to account for them

### 9.1 Limits in the code

| Limit | Value | Evidence |
|---|---|---|
| Global per IP | 600 requests per 60 seconds; keyed by client IP; shared via PostgreSQL when a pool exists; rejected with 429 `RATE_LIMITED` and `Retry-After` | `src/plugins/rate-limit.ts` (`GLOBAL_RATE_LIMIT`), `src/app.ts` |
| Exempt paths | `/health` and `/health/ready` | `src/plugins/rate-limit.ts` |
| Login per IP | 100 per 15 minutes | `src/modules/auth/routes.ts` (`loginPerIp`) |
| Login per login id | 10 per 15 minutes | `loginPerLoginId` |
| Password reset request per IP / per login id | 20 / 3 | `resetRequestPerIp`, `resetRequestPerLoginId` |
| Password reset confirm per login id | 10 | `resetConfirmPerLoginId` |
| Change password / step-up password per user | 10 / 10 | `changePasswordPerUser`, `stepUpPasswordPerUser` |
| Window length for auth limits | 15 minutes (`WINDOW_MS = 15 * 60 * 1000`, `src/modules/auth/routes.ts`); so the login limits are per 15 minutes | `src/modules/auth/routes.ts` |
| Client IP trust | `TRUST_PROXY` env setting controls whether `X-Forwarded-For` is honoured | `src/config/env.ts` |
| Session device limit | `SESSION_DEVICE_LIMIT`, default 1 (a new sign-in signs out the user's other session), maximum 100 | `src/config/env.ts` |
| Fixed-window counters | Counts begin at first hit in a window; rejected hits still count | `src/core/rate-limit.ts` |

### 9.2 Effect on load tests

| Effect | Consequence |
|---|---|
| A single load generator has one IP: 600 requests per minute is 10 requests per second in total; sign-in is also capped at 100 per IP per 15 minutes | Without adjustment, any test above 10 requests per second returns 429 and measures the limiter, not the application |
| Default device limit of 1 | Reusing one account on many virtual users signs the others out, producing 401 errors |
| Per-login limit of 10 per 15 minutes | Repeated sign-in of one user fails after 10 attempts |
| Rate limit lookups hit the database | Disabling the limiter changes database load; keep it in at least one test configuration |

### 9.3 How to account for them (Proposed approach)

| Run type | Approach |
|---|---|
| Capacity run (find application limits) | In a test environment only: raise the global limit through the `globalRateLimit` option as the baseline does (`buildApp({ globalRateLimit })` in `scripts/load-baseline.ts`), or run behind a proxy with `TRUST_PROXY` set and distribute source IPs. Raising the limit needs test-environment configuration or code access; do not change production values. Whether a deployable setting exists for this: To be confirmed (the global limit is not an environment variable in `src/config/env.ts`) |
| Realistic run (limits on) | Use many source IPs (several load generators or `X-Forwarded-For` through a trusted proxy) so that each IP stays below 600 per minute; expect and count 429 separately from failures |
| Limit verification run | Deliberately exceed limits; expect 429 with `Retry-After`; confirm health probes are never throttled and recovery after the window |
| Users | Create at least one test user per virtual user (synthetic ids such as `LOAD1000` as in the baseline) and set `SESSION_DEVICE_LIMIT` higher in the test environment (the baseline uses 100) |
| Sign-in | Sign in once per virtual user, reuse access tokens and refresh as real clients do; run a separate small sign-in test within login limits |
| Reporting | Report 429 counts separately; they must not be mixed into the error-rate threshold except in the limit verification run |

## 10. Environment and data requirements

### 10.1 Environment

| Item | Requirement |
|---|---|
| Target | Dedicated staging-class environment (does not exist yet, blocker B1); until then a dedicated test server |
| Sizing | Same CPU, memory, storage class and PostgreSQL version (18) as the intended production; exact sizes To be confirmed |
| Topology | Application on one host, PostgreSQL on a separate host, load generator on a third host in the same network zone |
| Configuration | Production-like `NODE_ENV=production` settings except for documented test overrides (rate limit, device limit); log level as production |
| Isolation | No shared use during tests; no real integrations; no email delivery |
| Database | PostgreSQL 18 with statistics enabled; `pg_stat_statements` enabled (To be confirmed) |

### 10.2 Data

| Rule | Detail |
|---|---|
| Synthetic data only | No production data, no real names, emails, GSTIN, PAN or bank data (see logging rules in `CORE__BACKEND/CLAUDE.md`) |
| Generation | Deterministic scripts creating fictional users, projects, plan lines, equipment and approvals; tag with a test prefix for removal |
| Volumes | Profiles in section 5.4 |
| Credentials | Test passwords are fictional, held in the test tool configuration, never in documents or repository |
| Files | Generated random bytes of 100 KB, 1 MB and 2 MB (maximum accepted) plus one over-limit file to confirm rejection |
| Tenants | Synthetic tenants named with a test prefix; create and drop through the supported tenant tooling (To be confirmed) |

## 11. Monitoring during tests

| What | How | Frequency |
|---|---|---|
| Availability of the target | External probe of `GET /health/ready` (never throttled, `src/plugins/rate-limit.ts`) | Every 5 seconds |
| Application logs | pino JSON logs (`LOG_LEVEL=info` for realistic runs); count errors and warnings including `readiness check failed` | Continuous |
| Host metrics | CPU, memory, disk, network on application, database and load generator hosts | 5 second samples |
| Node process | Heap, RSS, event loop delay (tool To be confirmed) | 5 second samples |
| PostgreSQL | Sessions by state, waiting locks, `pg_stat_activity`, `pg_stat_database`, `pg_stat_statements`, table and index sizes, replication lag if any | 10 second samples |
| Pool saturation | Database-side count of connections from the application against its limit of 10 | 5 second samples |
| Outbox | Pending event count and oldest age per tenant | 30 seconds |

## 12. Reporting template

### 12.1 Run header

Record per run: run ID, date and time (UTC), test type, build or commit, environment and sizing, rate-limit and device-limit settings, data profile, load tool and version, executed by.

### 12.2 Latency and throughput results (all cells empty: no results exist yet)

| Transaction | Users | Requests | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) | Errors | Threshold | Pass? |
|---|---|---|---|---|---|---|---|---|---|---|
| T1 Sign-in | | | | | | | | | 1,500 ms p95 | |
| T3 List (default page) | | | | | | | | | 500 ms p95 | |
| T4 List (limit 200) | | | | | | | | | 1,000 ms p95 (Proposed) | |
| T5 Plan line list | | | | | | | | | 500 ms p95 | |
| T6 Plan line save | | | | | | | | | 1,000 ms p95 | |
| T7 Equipment list | | | | | | | | | 500 ms p95 | |
| T8 Audit log list/filter | | | | | | | | | 500 ms p95 | |
| T9 Search | | | | | | | | | 500 ms p95 | |
| T10 Approvals | | | | | | | | | 500 / 1,000 ms p95 | |
| T11 Bulk upload (1,000 rows) | | | | | | | | | 10 min (Proposed) | |
| T12 File upload (2 MB) | | | | | | | | | 3,000 ms p95 (Proposed) | |
| T13 Event inbound | | | | | | | | | 1,000 ms p95 | |

### 12.3 Resource results

| Resource | Average | Peak | Threshold | Pass? |
|---|---|---|---|---|
| Application CPU | | | below 70% | |
| Application memory (start / end) | | | growth below 10% | |
| Database CPU | | | To be confirmed | |
| Database connections in use (of 10 pool) | | | no waiting | |
| Pool waiting events | | | 0 | |
| 429 responses | | | reported separately | |
| 5xx responses | | | below 1% | |

### 12.4 Stress, soak, spike and tenant-scale results

| Test | Key observation | Value |
|---|---|---|
| Stress | Users at first error above 1%; users at saturation; first bottleneck | |
| Soak | Latency drift and memory drift over duration | |
| Spike | Recovery time | |
| Tenant-scale | Tenants tested; migration time per tenant; relay sweep time at 10, 50, 200 tenants; readiness time | |

### 12.5 Findings and sign-off

| # | Finding | Severity | Defect or action ID | Owner |
|---|---|---|---|---|
| | | | | |

Conclusion (met / not met / partial): ____. Approved by: To be confirmed. Date: ____.

## 13. Capacity planning: factors to measure

| Factor | Why it matters | How to measure | Current knowledge |
|---|---|---|---|
| Rows per tenant by table | Drives list, search and index cost | `count(*)` and `pg_total_relation_size` per tenant schema | To be confirmed |
| Tenants per database | Catalog size, backup and migration time, sweep time | Tenant-scale test; `count` of `tenant_*` schemas | To be confirmed |
| Tenants per application instance and per database server | Decide when to shard | Test results at 10, 50, 200, 500 tenants | None yet |
| Concurrent users per tenant and overall | Pool and CPU sizing | Production analytics when live | To be confirmed |
| Requests per second at peak | Throughput planning | Load tests and later production metrics | None yet |
| Pool size versus throughput | Default pool is 10 connections per process | Load test with different pool sizes in a test branch | None yet |
| Average transaction time | Bounds throughput per connection | Request timing | None yet |
| Audit table growth | `audit_row_change` is append-only and grows without bound as coded: every audited write adds a row, and no retention, archival or partitioning job was found in `src/` or `migrations/` | Row count and bytes per tenant per week; rows added per write; extrapolate for 1, 3 and 5 years | Not measured |
| Authentication activity growth | `core_auth_activity` has no retention found; sessions are also kept after they end (comment in `0033_hot_path_indexes.sql`) | Same as audit | Not measured |
| Idempotency, outbox, rate limit tables growth | `integ_idempotency_key`, outbox event tables, `core_rate_limit_window` (cleanup behaviour To be confirmed) | Table sizes over the soak test | Not measured |
| File storage | Files up to 2 MB each are stored by the application (storage location To be confirmed: `core_file`) | Average file size times files per tenant | To be confirmed |
| Index size versus table size | Memory fit of hot indexes | `pg_relation_size` per index | Not measured |
| Backup size and duration, restore time | Feeds RPO and RTO in [17](17-Service-Catalogue-and-SLA.md) and [10](10-Business-Continuity-and-Disaster-Recovery-Plan.md) | Backup tool timing (`src/db/backup.ts`) and restore drills (`src/db/restore-drill.ts`) | Drill evidence under `CORE__BACKEND/docs/restore-drills/` (not summarised here) |
| Memory and CPU per instance | Instance sizing | Soak test | None yet |
| Outbox lag and relay throughput | Integration capacity | Baseline script relay section; real transport test | Baseline measures a mock transport only |

Because audit growth is unbounded as coded, a retention and archival decision is needed before long-term capacity can be stated; any change to `audit_row_change` must respect its append-only and hash-chain design (`src/core/audit.ts`). This is an open item, not a code change in this document.

## 14. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Running the baseline or a load test against a shared or production database | Low | Severe | Section 4.7 rules; dedicated test server; confirm host before run |
| R2 | Rate limits distort results (429 instead of application behaviour) | High | Medium | Section 9.3 |
| R3 | No staging environment (blocker B1) | High | High | Use a dedicated test server and label results as not staging |
| R7 | Many tenant schemas slow migration and sweeps | Medium | High | Tenant-scale test before onboarding many tenants |
| R8 | Unbounded audit growth degrades audit list and backup | High over time | High | Capacity tracking; retention decision |
| R10 | Argon2 hashing saturates CPU during sign-in storms | Medium | Medium | Test sign-in separately; spike test of sign-in |
| R11 | Results from local baseline taken as capacity proof | Medium | High | State limits (section 4.6) in every report |

## 15. Open items

| # | Item | Status |
|---|---|---|
| 1 | Document owner and test lead | To be confirmed |
| 2 | Staging environment and its sizing (blocker B1) | To be confirmed |
| 3 | Real traffic volumes: tenants, users per tenant, requests per second | To be confirmed |
| 4 | Load generator tool selection and licence | To be confirmed |
| 5 | Final acceptance thresholds (D19 is provisional); outbox lag target (D13) | To be confirmed |
| 6 | Whether a deployable setting exists to raise the global rate limit in test environments | To be confirmed |
| 7 | Audit and auth-activity retention and archival policy | To be confirmed |
| 8 | Pool size configurability and the chosen value | To be confirmed |
| 9 | File storage location and growth plan | To be confirmed |
| 10 | `pg_stat_statements` and host monitoring availability | To be confirmed |
| 11 | Front-end performance testing approach | To be confirmed |
| 12 | Results of all tests in this plan | Not available: no performance results exist yet |

## 16. Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | To be confirmed | First draft for review |
