# Business Continuity and Disaster Recovery Plan

| Field | Value |
|---|---|
| Document ID | DOC-10 |
| Title | Business Continuity and Disaster Recovery Plan |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Internal |

## 1. Purpose

This plan describes how the VeloxIQ Core service is protected against data loss and outage, how it is recovered, and what has actually been tested and measured. It records facts from the repository and marks every target, owner and contact that the repository cannot supply as To be confirmed.

## 2. Scope

| In scope | Out of scope |
|---|---|
| Core backend, its PostgreSQL 18 database (global schema and one schema per tenant), the static frontend build | Other VeloxIQ modules and their data |
| Backup, restore and the restore drill (`src/db/backup.ts`, `restore-drill.ts`, `restore-drill-cli.ts`) | Cloud account, network and hosting design (no staging or production environment exists; blocker B1, `SCHEDULE-STATUS.md`) |
| Failure scenarios, communication skeleton, test schedule | Physical site continuity, staffing continuity beyond the role skeleton |

Companion documents: DOC-09 (operations runbook), DOC-08 (test strategy), DOC-11 (release and change management).

## 3. Critical functions and dependencies

### 3.1 Critical functions

Ranking by business impact is To be confirmed; the table lists the functions the system performs (`CORE__BACKEND/README.md`, `docs/API_V1.md`).

| Function | Description | Criticality |
|---|---|---|
| Sign-in and session control | Password and passkey login, rotating refresh tokens, one active session per user | To be confirmed |
| Tenant isolation | One schema per tenant; tenant taken from the verified token | To be confirmed |
| Access administration | Users, privileges, step-up checks | To be confirmed |
| Approvals | Chains, requests, decisions, reminders | To be confirmed |
| Master data and projects | Projects, locations, stores, materials, equipment, organisation | To be confirmed |
| Policies and records | Company policies with versions, records and grievances | To be confirmed |
| Audit trail | Append-only, hash-chained `audit_row_change` | To be confirmed |
| Integration events | Outbox and inbox, relay, dead-letter and replay (transport not yet configured, D13) | To be confirmed |

### 3.2 Dependencies

| Dependency | Used for | Continuity note |
|---|---|---|
| PostgreSQL 18 server | All data | Single database holds the global schema and all tenant schemas. Replication, standby and PITR are not configured in the repository (PITR needs staging, B1). |
| Database roles | Migrations (owner) and application (`core_app`) | `core_app` not yet created (blocker B3) |
| `pg_dump` and `pg_restore` (version 18 or newer) | Backup, restore, drill | `PG_BIN` if not on PATH |
| Secret store | `JWT_SECRET`, database credentials | Not defined (B1) |
| TLS termination and load balancer | HTTPS in front of the API | Not defined (B1); `TRUST_PROXY` for address handling |
| Backup storage | Dump files | Location, encryption, retention To be confirmed |
| Email provider | Password reset | None chosen (decision D10): reset answers 503 `OTP_DELIVERY_UNAVAILABLE` |
| Event transport | Outbound events | Open decision D13; mock transport only |
| Hosting, DNS, certificates | Reachability | To be confirmed |
| Node 24 runtime | API process | Redeploy a previous build to roll back code (`DEPLOYMENT.md`) |

## 4. Backup design

Sources: `CORE__BACKEND/src/db/backup.ts`, `backup-cli.ts`, `docs/DEPLOYMENT.md`.

| Aspect | Design |
|---|---|
| Unit of backup | One tenant: `npm run db:backup -- <tenantId> <file>` writes a custom-format dump (`pg_dump --format=custom --schema=tenant_<id>`) of that schema only |
| Global data | Not included in a tenant dump. Back up the whole database with `pg_dump --format=custom` on the same schedule. Restore the `shared` schema data before any tenant, because tenant materials, allocations and plan lines reference `shared.uom`. |
| Restore | `npm run db:restore -- <tenantId> <file> --replace` runs `pg_restore --clean --schema=tenant_<id>`. It refuses without `--replace`. It creates an empty schema first when it is missing (fix for defect D13). The schema filter means a restore never touches another tenant. |
| Tenant id safety | Id must match `^[a-z][a-z0-9_]{0,39}$`; anything else is rejected |
| Credentials | Password passed in `PGPASSWORD`, not on the command line; tool error output is scrubbed of connection strings and passwords |
| Tool location | `PG_BIN` or PATH; tools must be version 18 or newer |
| Protection of files | Dumps contain personal and tenant data: encrypt at rest, keep outside the repository and build folders, restrict readers |
| Schedule | Not implemented in the repository. Decision D20 (provisional, delegated by the owner on 2026-11-22): daily snapshots kept 35 days, point-in-time recovery on, restore rehearsal before each release. |
| Retention of data | Provisional decision D21: audit trail and approval requests 8 years; sign-in and access history 1 year; idempotency records 24 hours. Confirm with legal. |
| Audit evidence | Audit rows are append-only (migration `0002_audit_append_only.sql`); the `core_app` role has UPDATE, DELETE and TRUNCATE revoked on `audit_row_change`. Do not drop a tenant schema to roll back: it removes the evidence (`DEPLOYMENT.md`). |

What is not in place (from the repository): backup scheduler, off-host copy, encryption tooling, PITR, a standby database, a global-schema backup command (only the documented `pg_dump` instruction).

## 5. Recovery procedures

All commands run from `CORE__BACKEND`. The database commands need the owner role (see DOC-09, section 5.3). Use a maintenance window for production restores (`DEPLOYMENT.md`).

### 5.1 Restore one tenant (schema damaged or data wrongly changed)

| Step | Action |
|---|---|
| 1 | Declare the incident; stop writes for that tenant if possible (maintenance notice) |
| 2 | Identify the last good backup file for `tenant_<id>`; check its time against the change that must be undone |
| 3 | Restore into a staging or scratch database first and check row counts (`DEPLOYMENT.md`) |
| 4 | Take a fresh backup of the current damaged state (`npm run db:backup -- <id> <file>`) so nothing is lost |
| 5 | `npm run db:restore -- <id> <file> --replace` |
| 6 | Verify: `GET /health/ready`; sign in as an administrator; compare counts with the drill report for the tenant; run the audit-chain check (the drill runs `verifyAuditChain`) |
| 7 | Re-open the tenant; record the incident, the backup used, and the data window lost |

### 5.2 Restore after total loss (fresh server)

Order matters (`DEPLOYMENT.md`, drill order in `restore-drill.ts`).

| Step | Action |
|---|---|
| 1 | Install PostgreSQL 18 and the version-18 client tools; create the database and roles (owner role; `core_app` per `scripts/admin/create-core-app-role.sql` and `grant-core-app-tables.sql`) |
| 2 | Deploy the release build; set environment variables from the secret store (DOC-09, section 3.2) |
| 3 | `npm run db:migrate` (global migrations; checksums in `core_migration` must match the release) |
| 4 | Restore the `shared` data from the whole-database dump (before any tenant) |
| 5 | For each tenant: `npm run db:restore -- <id> <file> --replace` (the schema is created if missing) |
| 6 | `npm run db:migrate` again so every tenant schema is at the release level |
| 7 | Re-apply `grant-core-app-tables.sql` |
| 8 | Start the API (`npm start`); check `/health` and `/health/ready` |
| 9 | Per tenant: sign in, compare counts and audit rows with the last drill report |
| 10 | Notify stakeholders (section 10); record times for each step |

### 5.3 Bad deploy (code)

Redeploy the previous build. Migrations are forward-only and are not reversed. If a migration caused data damage, restore the affected tenant from the backup taken before the change (`DEPLOYMENT.md`, "Rollback"). Never edit a migration that has run: the checksum check refuses it.

### 5.4 Credential compromise

| Step | Action |
|---|---|
| 1 | Rotate the exposed secret: `JWT_SECRET` (all access tokens become invalid when it changes; HS256) or the database password |
| 2 | Restart the API with the new values |
| 3 | For a user credential: revoke the user's sessions and reset the password (Devices page, administrator reset); suspend access if needed |
| 4 | Review the audit trail and access history (`GET /audit-log`, `GET /audit-log/auth-events`) for the exposure window |
| 5 | If a refresh-token theft is suspected: the server ends every session of the user when a rotated token is replayed (`src/modules/auth/service.ts`) |
| 6 | Record the incident; security contact To be confirmed |

## 6. Drill procedure

Command: `npm run db:drill -- <tenantId> [--report <file.md>] [--keep-dump]` (`src/db/restore-drill-cli.ts`, `restore-drill.ts`).

| Step | What the drill does |
|---|---|
| 1 | Fingerprints the source tenant (row count and content checksum, md5 over row md5s, for every table) and checks its audit hash chain |
| 2 | Dumps the `shared` reference data and the tenant schema with the same tools as `db:backup` |
| 3 | Creates a scratch database, applies the global migrations, restores the shared data, then the tenant (the real recovery order) |
| 4 | Fingerprints the restored copy, compares every table, and checks the restored audit chain |
| 5 | Drops the scratch database and deletes the dump files (unless `--keep-dump`), prints the result and the time of each step |

Properties: the source is only read; the user needs the right to create databases; exit code 1 on failure so a scheduler can alert; the report holds counts and timings only, no data or connection details; the restore time it reports is "the measured recovery time for that tenant's size" (`DEPLOYMENT.md`). Five automated tests cover it (`tests/hardening/restore-drill.test.ts`).

## 7. Drill results recorded so far

Quoted from the drill reports. All runs are on the development database, on one machine, not on staging or production.

| Report | Tenant | Date (UTC start) | Result | Tables | Rows | Dump size | Audit chain (source / restored) | Restore time (scratch DB to verified copy) | Whole drill | Differences |
|---|---|---|---|---|---|---|---|---|---|---|
| `CORE__BACKEND/docs/restore-drills/2026-11-21-acme.md` | acme | 2026-11-21 10:40 | PASSED | 62 | 2,328 | 1,187.9 KiB | 708 intact / 708 intact | 2.0 s | 3.7 s | none |
| `CORE__BACKEND/docs/restore-drills/2026-11-21-beta.md` | beta | 2026-11-21 10:40 | PASSED | 62 | 1,201 | 374.4 KiB | 413 intact / 413 intact | 2.0 s | 3.4 s | none |
| `evidence/sprint-review-2026-11-21/restore-drill/acme.md` | acme | 2026-11-21 14:56 | PASSED | 62 | 2,334 | 1,188.3 KiB | 708 intact / 708 intact | 2.2 s | 7.5 s | none |
| `evidence/sprint-review-2026-11-21/restore-drill/beta.md` | beta | 2026-11-21 14:56 | PASSED | 62 | 1,201 | 374.4 KiB | 413 intact / 413 intact | 2.9 s | 6.5 s | none |
| `evidence/regression-2-2026-11-22/restore-drill-acme.md` | acme | 2026-11-22 12:25 | PASSED | 65 | 2,369 | 1,205.0 KiB | 708 intact / 708 intact | 1.5 s | 3.8 s | none |
| `evidence/regression-2-2026-11-22/restore-drill-delta.md` | delta | 2026-11-22 12:26 | PASSED | 65 | 130 | 237.8 KiB | 7 intact / 7 intact | 1.2 s | 1.9 s | none |

Step timings for the first acme drill (2026-11-21 10:40): fingerprint source 0.26 s; audit chain check 0.04 s; dump shared data 0.48 s; dump tenant 0.49 s; create scratch database 0.22 s; apply global migrations 0.12 s; restore shared data 0.12 s; restore tenant 1.38 s; fingerprint restored copy 0.15 s; audit chain check 0.04 s; drop scratch database 0.42 s.

Related findings recorded in `DEFECTS.md` and `SCHEDULE-STATUS.md`:

| Finding | Detail |
|---|---|
| D13 (High) | The first drill found that a restore onto a fresh server failed ("schema tenant_acme does not exist"). Fixed: `restoreTenant` creates the empty schema first. |
| Drill fix | A failed drop of the scratch database is now always reported; one leftover scratch database from an earlier failing run was dropped |
| CORE-26-07 | Restore drill with audit continuity: no differences |
| CORE-28-07 (Blocked) | Local drill passes; point-in-time recovery needs staging (B1); migrator versus app role needs B3 |

Limits of the evidence: tenants are small (at most 2,369 rows and about 1.2 MiB); no production-size restore, no network or off-host restore, no restore of the global schema as a separate dump, no PITR, and no timing that includes people, approvals or decision making.

## 8. Recovery objectives (RPO and RTO)

| Measure | Measured by drills | Provisional figure in the repository | Target |
|---|---|---|---|
| RTO, technical restore of one tenant | 1.2 s to 2.9 s from scratch database creation to verified copy (6 drills, tenants of 130 to 2,369 rows); whole drill 1.9 s to 7.5 s | Decision D20 (provisional, delegated by the owner, 2026-11-22): RTO 4 hours | **To be confirmed by the business** |
| RTO, full service (new server, migrations, all tenants, DNS, people) | Not measured | Same 4 hours (provisional) | **To be confirmed by the business** |
| RPO | Not measured; no backup schedule exists in the repository. The data age at restore equals the age of the last backup. | Decision D20: RPO 15 minutes with PITR on, daily snapshots kept 35 days (provisional) | **To be confirmed by the business** |
| Snapshot retention | n/a | 35 days (provisional, D20) | To be confirmed |

The drills prove the restore mechanics and data integrity on small development tenants. They do not demonstrate the 15-minute RPO, because PITR does not exist yet.

## 9. Failure scenarios

| Scenario | Detection | Response | Recovery reference |
|---|---|---|---|
| Database loss (server, disk, instance) | `/health/ready` returns 503 (database check fails); request errors; the 5-second connection timeout in `src/db/client.ts` makes requests fail instead of hang; readiness warning in logs | Declare SEV1 (Proposed, DOC-09); stand up a new PostgreSQL 18; follow 5.2 | 5.2; last backup defines data loss |
| Tenant schema corruption or wrong data change | A tenant's users report errors or wrong data; `db:drill` or audit-chain check shows differences; 500 `INTERNAL_ERROR` for one tenant only | Restrict the tenant; back up the current state; restore from the last good dump with `--replace`; verify | 5.1 |
| Credential compromise (`JWT_SECRET`, database password, user credential) | Unexpected sign-ins or privilege changes in access history and audit trail; repeated `AUTH_INVALID_CREDENTIALS`, lockouts; external report | Rotate the secret; restart; revoke sessions and reset passwords; review the audit trail | 5.4 |
| Bad deploy | Failing readiness or smoke test after release; rising 5xx; startup "Invalid environment"; migration refused (checksum) | Redeploy the previous build; restore a tenant only if data was damaged; do not edit applied migrations | 5.3 |
| Event relay down or events stuck | `GET /integration-events/summary` shows pending or dead-lettered events; log line "event dead-lettered" or "event relay failed". Note: the relay is not started by `server.ts` until transport and retry values are configured, so no outbound delivery is expected today. | Outbox events are stored in the tenant database in the same transaction as the change, so no event is lost while the relay is down. Restart the relay once the transport is available; dead-lettered events hold back later events of the same aggregate until replayed; replay with `POST /integration-events/{id}/replay` (`access.manage`, audited), in aggregate order | `src/core/relay.ts`; production transport open (D13, D14) |
| Audit chain break | `verifyAuditChain` returns `brokenAt` (runs in the drill for source and restored copy); the append-only trigger blocks normal edits, so a break means changes behind the trigger | Treat as a security incident (SEV1 Proposed); preserve the database; compare with the most recent backup and drill report; restore a prior copy for comparison; do not drop the schema | `DEPLOYMENT.md` ("Do not drop a tenant schema"); security contact To be confirmed |
| Rate limiting or address misattribution after a proxy change | Many users receive 429 `RATE_LIMITED` | Set `TRUST_PROXY` to the load balancer addresses | DOC-09 section 12 |
| Email provider absent | Password reset 503 `OTP_DELIVERY_UNAVAILABLE` | Administrator resets passwords | Decision D10 |
| Backup tool missing or wrong version | "pg_dump was not found"; backup or drill fails | Set `PG_BIN`; install version 18 tools | DOC-09 |
| Loss of the backup store | Backup jobs fail or files missing | Take an immediate new backup from the live database; restore the store | Off-host copy To be confirmed |

## 10. Communication plan skeleton

All roles, names, contacts, channels and templates are To be confirmed.

| Audience | Role responsible | Channel | When | Content |
|---|---|---|---|---|
| Incident team | Incident commander (To be confirmed) | To be confirmed | At declaration | Severity, scope, owner, next update time |
| Engineering and operations | Operations lead (To be confirmed) | To be confirmed | Continuous during incident | Actions, findings |
| Business owner and executives | Business owner (To be confirmed) | To be confirmed | SEV1 and SEV2 at declaration and each update | Impact, expected restore time, data loss window |
| Tenant administrators and users | Communications lead (To be confirmed) | In-app notice, email (provider To be confirmed) | At start, at each change, at resolution | What is affected, what to do, when to expect the next update |
| Regulators, auditors, legal | Legal or compliance contact (To be confirmed) | To be confirmed | If personal data or audit evidence is affected | To be confirmed |
| Vendors (hosting, database, email) | To be confirmed | To be confirmed | When their service is involved | To be confirmed |

Post-incident: review within a period To be confirmed; record timeline, cause, data window lost, measured recovery time, corrective actions.

Information never to be sent in communications: passwords, tokens, connection strings, backup files, personal data (consistent with `DEPLOYMENT.md` handling rules).

## 11. Testing schedule (Proposed)

`DEPLOYMENT.md` already states: run the drill monthly per tenant and after any schema or backup-tooling change; decision D20: a restore rehearsal before each release. The table below is **Proposed** and not adopted.

| Test | Frequency | Method | Evidence |
|---|---|---|---|
| Restore drill, every tenant | Monthly and before each release | `npm run db:drill -- <tenantId> --report <file>` | Report kept in `CORE__BACKEND/docs/restore-drills/` |
| Drill after schema or backup-tool change | Each such change | Same | Report |
| Full rebuild on a fresh server (5.2), including the global schema dump | Twice a year | Staging environment, timed | Timed checklist and sign-off |
| Restore from the off-host store | Quarterly | Retrieve a dump from storage, restore to scratch | Report |
| Point-in-time recovery rehearsal | Quarterly, once PITR exists (B1) | Recover to a chosen time, verify | Report; measured RPO |
| Secret rotation exercise | Annually | Rotate `JWT_SECRET` in staging, check sessions end | Checklist |
| Bad-deploy rollback exercise | Each release candidate | Redeploy previous build in staging | Release checklist |
| Event replay exercise | After the transport is chosen | Dead-letter and replay in staging | Test report |
| Tabletop incident exercise | Annually | Walk through scenarios in section 9 | Minutes and actions |
| Review of this plan | Annually and after any real incident | Update owners, contacts, targets | Revision history |

## 12. Open items

| # | Item | Status |
|---|---|---|
| 1 | Document owner, incident commander, communications lead, business owner, contacts | To be confirmed |
| 2 | Business-approved RPO and RTO (the repository holds only provisional D20 values) | To be confirmed |
| 3 | Criticality ranking of functions and maximum tolerable downtime | To be confirmed |
| 4 | Backup scheduler, off-host storage, encryption method, retention enforcement | To be confirmed |
| 5 | Command or script for the global-schema backup and restore (only the `pg_dump` instruction exists) | To be confirmed |
| 6 | PITR, standby database and hosting platform (blocker B1) | To be confirmed |
| 7 | The `core_app` role and migrator-versus-app role rehearsal (blocker B3, CORE-28-07) | To be confirmed |
| 8 | Event transport, retry and dead-letter values, relay startup (D13, D14) | To be confirmed |
| 9 | Retention periods (D21) confirmed with legal | To be confirmed |
| 10 | Security incident contact; regulator notification duties | To be confirmed |
| 11 | Larger-scale drill with realistic tenant sizes | To be confirmed |
| 12 | Communication channels and templates; email provider (D10) | To be confirmed |

## 13. Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | To be confirmed | First draft from repository review |
