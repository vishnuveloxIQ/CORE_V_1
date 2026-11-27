# VeloxIQ Core: Service Catalogue and Service Level Agreement Framework

| Field | Value |
|---|---|
| Document ID | DOC-17 |
| Title | Service Catalogue and SLA Framework |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Internal |

> **Important.** Every target, hour, tier, percentage and credit in this document is **Proposed** for discussion. Nothing here is a commitment. Proposed targets must be agreed with the business before they are published to customers. Figures are labelled "Proposed targets — to be agreed with the business".

## 1. Purpose

Define what services VeloxIQ Core provides, how they are supported, and a framework of service levels (priorities, availability, recovery, measurement, credits, escalation, reporting) that the business can agree and later operate.

## 2. Scope

| In scope | Out of scope |
|---|---|
| The CORE backend (`CORE__BACKEND`, Fastify on Node 24, PostgreSQL 18) and frontend (`CORE__FRONTEND`, React 19 and Vite) as delivered | Other modules that integrate with CORE (HRMS, PMS and similar): their own service levels |
| Multi-tenant (schema-per-tenant) operation | Customer networks, devices and browsers |
| Support processes and service level framework | Hosting provider SLAs (hosting not yet decided: see Open items) |

Related documents: [09 Operations Runbook and Support Model](09-Operations-Runbook-and-Support-Model.md), [10 Business Continuity and DR Plan](10-Business-Continuity-and-Disaster-Recovery-Plan.md), [08 Test Strategy and Quality Plan](08-Test-Strategy-and-Quality-Plan.md), [11 Release and Change Management](11-Release-and-Change-Management.md), [19 Performance and Capacity Test Plan](19-Performance-and-Capacity-Test-Plan.md).

## 3. Service catalogue

Source of truth for modules: `CORE__BACKEND/src/modules/` (access, approvals, audit-log, auth, boq, equipment-units, integration, maintenance, masters, offer-letter, offline, organisation, policies, projects, records, search, stock-levels, uoms), wired in `CORE__BACKEND/src/app.ts`.

| ID | Service | Description | Main backend modules (evidence) | Primary users | Criticality (Proposed) |
|---|---|---|---|---|---|
| S1 | Authentication and access | Password sign-in, rotating refresh tokens, OTP password reset, passkeys, step-up, device/session limit, role and privilege management, lockouts | `src/modules/auth`, `src/modules/access`, `src/plugins/` | All users, access administrators | Critical |
| S2 | Master data management | Organisation, projects, locations, stores, vendors, materials, equipment types, calendars, number series, units of measure | `organisation`, `projects`, `masters`, `uoms`, `boq`, `stock-levels` | Administrators, planners | High |
| S3 | Planning | Plan lines, equipment register and units, maintenance schedules, BOQ items | `masters` (plan-lines), `equipment-units`, `maintenance`, `boq` | Planners, site teams | High |
| S4 | Approvals | Approval chains and matrix versions, requests, levels, reminders (sweep every `APPROVAL_REMINDER_MINUTES`, default 15) | `approvals`, `src/modules/approvals/reminders-cli.ts` | Requesters, approvers | High |
| S5 | Audit and activity log | Append-only row-change trail (`audit_row_change`), authentication activity, external audit entries from other modules | `audit-log`, `src/core/audit.ts`, migration `0002_audit_append_only.sql` | Access administrators, auditors | High |
| S6 | Integration hub | Outbound events through an outbox and relay, inbound events, replay, reference records and sync status | `integration`, `src/core/events.ts`, `src/core/relay.ts`, migrations `0039_event_relay.sql`, `0040_ref_records.sql` | Integrating modules, administrators | High |
| S7 | Records, files and bulk upload | Grievances, tickets, files (up to 2 MB per upload), import batches with row-by-row submission | `records`, `src/modules/records/rules.ts` (`FILE_CONTENT_MAX_BYTES`) | Operations users | Medium |
| S8 | Policies and offer letters | Policy and OT/leave rule versions, document templates, offer letter revisions | `policies`, `offer-letter` | HR users | Medium |
| S9 | Search and reporting/export | Cross-entity search; list endpoints with paging. Which exports exist: To be confirmed | `search`, list routes with `limit`/`offset` | All users | Medium |
| S10 | Offline support | Offline synchronisation endpoints | `offline` | Field users | To be confirmed |
| S11 | Platform operations | Health probes, backups and restore drills, migrations per tenant | `src/core/health.ts`, `src/db/backup.ts`, `src/db/restore-drill.ts`, `migrations/` | Operations team | Critical (internal) |

Further description of each service: see [02 System Architecture](02-System-Architecture.md) and `CORE__BACKEND/docs/API_V1.md`.

## 4. Service hours and support tiers

### 4.1 Service hours (Proposed)

| Item | Proposed |
|---|---|
| Service availability window | 24x7, excluding agreed maintenance windows |
| Support desk hours | Business hours, Monday to Friday, local business time zone (To be confirmed) |
| Out-of-hours support | P1 only, on-call (To be confirmed whether offered and at what cost) |
| Public holidays | Follow customer region calendar (To be confirmed) |
| Time zone reference | To be confirmed |

### 4.2 Support tiers (Proposed)

| Tier | Role | Typical activities | Escalates to |
|---|---|---|---|
| Tier 0 | Self service | User guide, FAQ, password reset flow | Tier 1 |
| Tier 1 | Service desk | Log, categorise, verify, known-error fixes, user and role questions | Tier 2 |
| Tier 2 | Application support | Log and audit-log analysis, data corrections through supported tools, configuration, tenant issues | Tier 3 |
| Tier 3 | Engineering | Defect fixes, performance tuning, database and infrastructure work | Vendor or hosting provider |

Roles, named people and contact channels: To be confirmed. See [09 Operations Runbook and Support Model](09-Operations-Runbook-and-Support-Model.md).

## 5. Incident priority definitions

### 5.1 Priority matrix

| Priority | Definition | Examples |
|---|---|---|
| P1 Critical | Service unavailable or data integrity/security at risk for many users or a whole tenant, no workaround | `/health/ready` returns 503 for all tenants; no sign-in possible; suspected data loss or cross-tenant exposure |
| P2 High | Major function degraded or unavailable for many users, workaround is partial | Approvals cannot be submitted; integration events stuck; severe slowness |
| P3 Medium | Minor function impaired, workaround exists, few users | One list or search fails; a single user locked out |
| P4 Low | Cosmetic issue, question, or service request | Label wording, how-to question, enhancement request |

### 5.2 Response and resolution targets

**Proposed targets — to be agreed with the business.** Clock hours apply to P1 only outside business hours if out-of-hours support is agreed; otherwise business hours apply.

| Priority | Initial response | Update frequency | Resolution or workaround target | Proposed support window |
|---|---|---|---|---|
| P1 | 30 minutes | Every 60 minutes | 4 hours | 24x7 (if agreed) |
| P2 | 2 hours | Every 4 hours | 1 business day | Business hours |
| P3 | 1 business day | Every 2 business days | 5 business days | Business hours |
| P4 | 2 business days | On change | Next planned release or by agreement | Business hours |

Rules (Proposed): the service desk may change a priority and informs the reporter; the clock stops while waiting for the customer; resolution means service restored or an accepted workaround; a root-cause analysis follows each P1 within a proposed 5 business days.

## 6. Availability target options

Monthly allowed downtime is computed on a 30-day month (30 x 24 x 60 = 43,200 minutes), excluding agreed maintenance windows. Downtime = 43,200 x (1 - target).

| Option | Target | Allowed downtime per 30-day month | Approximate per year (365 days, 525,600 min) |
|---|---|---|---|
| A | 99.0% | 432 minutes (7 h 12 min) | 5,256 min (about 87.6 h) |
| B | 99.5% | 216 minutes (3 h 36 min) | 2,628 min (about 43.8 h) |
| C | 99.9% | 43.2 minutes (43 min 12 s) | 525.6 min (about 8.76 h) |
| D | 99.95% | 21.6 minutes (21 min 36 s) | 262.8 min (about 4.38 h) |

Selection guidance (Proposed): options C and D usually need redundant application instances, a managed or replicated PostgreSQL and a tested failover. The repository shows a single process creating one connection pool of 10 connections by default (`CORE__BACKEND/src/server.ts`, `src/db/client.ts`); the high-availability topology is To be confirmed in [02 System Architecture](02-System-Architecture.md) and [10 BC/DR Plan](10-Business-Continuity-and-Disaster-Recovery-Plan.md). Selected option: To be confirmed.

## 7. Recovery objectives (RPO and RTO options)

Proposed options only. Achievability depends on the backup and replication design in [10 Business Continuity and DR Plan](10-Business-Continuity-and-Disaster-Recovery-Plan.md). The repository contains a backup routine (`src/db/backup.ts`) and a restore-drill tool (`src/db/restore-drill.ts`; evidence folder `CORE__BACKEND/docs/restore-drills/`).

| Option | RPO (maximum data loss) | RTO (maximum restore time) | Typical mechanism (indicative) |
|---|---|---|---|
| R1 | 24 hours | 24 hours | Daily logical backup, manual restore |
| R2 | 4 hours | 8 hours | Frequent backups, rehearsed restore |
| R3 | 15 minutes | 4 hours | Continuous WAL archiving, point-in-time recovery |
| R4 | Near zero | 1 hour | Replica with failover |

Selected option: To be confirmed. The SLA should not promise an RTO until a restore drill supports it.

## 8. Measurement method

### 8.1 What the system can measure today

| Mechanism | Evidence | What it gives | Limits |
|---|---|---|---|
| `GET /health` | `src/core/health.ts` | Liveness: process is up (`{data:{status:"ok"}}`) | Does not test the database |
| `GET /health/ready` | `src/core/health.ts`, `src/server.ts` | Readiness: runs registered checks; 200 or 503. The registered check is `database` (`SELECT 1`) | Tests only database connectivity, not tenant schemas, relay or the approvals sweep |
| Probe exemption | `src/plugins/rate-limit.ts` (`EXEMPT_PATHS`) | Probes are never rate limited, so an external monitor is not blocked | None |
| Structured logs | pino logger (`LOG_LEVEL` in `src/config/env.ts`); readiness failures logged as `readiness check failed` | Event trail for incidents | Log aggregation and retention: To be confirmed |
| Request correlation | `x-request-id` header read in `src/http/app.ts` | Correlating a user report to a request | End-to-end propagation to logs: To be confirmed |
| Audit trail | `audit_row_change` (append-only, chain checked by `verifyAuditChain` in `src/core/audit.ts`); `GET /audit-log` | Who changed what and when | Not a performance or availability measure |
| Authentication activity | `core_auth_activity`; `GET /audit-log/auth-events` | Sign-in successes, failures, lockouts | Not a latency measure |
| Load baseline script | `CORE__BACKEND/scripts/load-baseline.ts` | Local latency and throughput (see [19](19-Performance-and-Capacity-Test-Plan.md)) | Not production monitoring |

### 8.2 Not available today (gaps)

| Gap | Impact on the SLA | Proposed remedy |
|---|---|---|
| No metrics endpoint (for example Prometheus) found in `src/` | Latency percentiles and error rates cannot be reported from production | Add metrics or an APM tool (To be confirmed) |
| No external synthetic monitor configured in the repository | Availability cannot be computed independently | External probe of `/health/ready` every 1 minute (Proposed) |
| Single readiness check | An outage of one tenant schema or the relay is invisible | Extend readiness or add business checks (To be confirmed) |
| No incident or ticketing tool recorded | P1-P4 clocks cannot be measured | Select a tool (To be confirmed) |

### 8.3 Proposed availability calculation

Availability % = (minutes in month - agreed maintenance minutes - downtime minutes) / (minutes in month - agreed maintenance minutes) x 100. Downtime (Proposed definition) = minutes in which the external probe of `/health/ready` fails on 2 or more consecutive checks, or the service is unusable for users as confirmed in the incident record.

## 9. Exclusions (Proposed)

| Excluded from availability and response targets |
|---|
| Agreed scheduled maintenance inside the maintenance windows (section 11) |
| Emergency maintenance required to protect security, with best-effort notice |
| Customer-caused faults: misconfiguration, invalid data, exceeding documented limits (2 MB file limit in `src/modules/records/rules.ts`; 1 MB default request body in `src/http/app.ts`; 600 requests per minute per IP in `src/plugins/rate-limit.ts`) |
| Failures of the customer network, devices, browsers or identity infrastructure |
| Force majeure and third-party failures outside vendor control (see [13 Third-Party Software Inventory](13-Third-Party-Software-Inventory.md)) |
| Non-production environments (development, test, staging) |
| Features marked beta or trial |
| Email delivery: no email provider is selected in the code (a sample OTP is used before production, `SAMPLE_OTP_CODE` in `src/config/env.ts`) |

## 10. Service credits skeleton

**Proposed structure only. No credits are offered until the business and legal agree them.**

| Monthly availability achieved (against agreed target) | Credit as percentage of monthly fee |
|---|---|
| At or above target | 0% |
| Below target, down to a first threshold | To be confirmed |
| Below first threshold, down to a second threshold | To be confirmed |
| Below second threshold | To be confirmed |

| Credit rule | Proposed wording |
|---|---|
| Claim | Customer requests within 30 days of the monthly report |
| Cap | Maximum credit per month: To be confirmed |
| Sole remedy | To be confirmed with legal |
| Eligibility | Not available for events in section 9 |

## 11. Change and maintenance windows (Proposed)

Aligns with [11 Release and Change Management](11-Release-and-Change-Management.md). Database migrations are SQL files applied to every tenant schema (`CORE__BACKEND/migrations/`), so release duration grows with the number of tenants; measure it in the tenant-scale test in [19](19-Performance-and-Capacity-Test-Plan.md).

| Change type | Proposed window | Notice | Approval |
|---|---|---|---|
| Standard release | Weekly or fortnightly, off-peak, for example 22:00 to 02:00 local time (To be confirmed) | 5 business days | Change approver (To be confirmed) |
| Minor configuration | Business hours if no downtime | 1 business day | Service owner |
| Emergency | Any time | As soon as possible | Emergency approver |
| Maximum planned maintenance per month | 4 hours, outside availability calculation | n/a | n/a |

## 12. Customer responsibilities

| Responsibility |
|---|
| Nominate authorised contacts and keep the list current |
| Report incidents through the agreed channel with steps, time, tenant and screenshots; never send passwords or personal data |
| Manage user lifecycle and privileges in their tenant (access administrators) |
| Supply accurate master data and test bulk uploads in a non-production tenant first |
| Stay within documented limits (page size up to 200 rows, files up to 2 MB, rate limits) |
| Provide timely access, information and testing during incidents and releases |
| Keep client devices and browsers on supported versions (supported list: To be confirmed) |
| Protect credentials and use the sign-in controls provided (passkeys, step-up) |

## 13. Escalation matrix skeleton

Names and contacts: To be confirmed.

| Level | Role | Name | Contact | Escalate when (Proposed) |
|---|---|---|---|---|
| 1 | Service desk analyst | To be confirmed | To be confirmed | Initial |
| 2 | Application support lead | To be confirmed | To be confirmed | P1 unresolved after 30 minutes, P2 after 4 hours |
| 3 | Engineering lead | To be confirmed | To be confirmed | P1 unresolved after 1 hour, P2 after 1 business day |
| 4 | Service owner / delivery manager | To be confirmed | To be confirmed | P1 unresolved after 2 hours, or any security or data breach |
| 5 | Executive sponsor | To be confirmed | To be confirmed | P1 beyond resolution target, or customer escalation |
| Security | Information security contact | To be confirmed | To be confirmed | Any suspected breach or cross-tenant exposure |

## 14. Reporting: monthly service report template

Reporting period: ____ to ____. Prepared by: ____. Tenant or customer: ____.

| Measure | Target (Proposed) | Actual | Met? |
|---|---|---|---|
| Availability (external probe of `/health/ready`) | Option selected in section 6 | | |
| Total downtime minutes (excluding agreed maintenance) | | | |
| P1 incidents: count, within response, within resolution | | | |
| P2 incidents: count, within response, within resolution | | | |
| P3 and P4 incidents: count, within target | | | |
| Median and 95th percentile API latency | Targets in [19](19-Performance-and-Capacity-Test-Plan.md) | Not measurable until metrics exist | |
| Error rate (5xx share of requests) | Below 1% (Proposed) | | |
| Backups completed; restore drill date and result | | | |
| Changes: standard, emergency, failed | | | |
| Outbox events pending or dead-lettered | To be confirmed | | |
| Service requests opened and closed | | | |

| Report section | Content |
|---|---|
| Incident summary | Each P1 and P2 with cause, duration, action |
| Problems and root causes | Open problems and owners |
| Capacity | Database size, tenant count, audit table growth (see [19](19-Performance-and-Capacity-Test-Plan.md) section 13) |
| Credits due | Per section 10, if agreed |
| Upcoming changes | Planned releases and windows |

## 15. Review cycle (Proposed)

| Activity | Frequency | Participants |
|---|---|---|
| Operational review of incidents and report | Monthly | Service desk, application support, customer representative |
| Service review (targets, trends, credits) | Quarterly | Service owner, customer sponsor |
| SLA framework review (targets, hours, tiers, exclusions) | Annually, or after a major change | Business, engineering, legal |
| Targets re-baseline | After first production quarter and after each load test | Engineering, operations |

## 16. Open items

| # | Item | Status |
|---|---|---|
| 1 | Document owner and service owner | To be confirmed |
| 2 | Hosting model and provider, and their SLAs | To be confirmed |
| 3 | Chosen availability option and RPO/RTO option | To be confirmed |
| 4 | Support hours, time zone and out-of-hours coverage | To be confirmed |
| 5 | Incident and ticketing tool; escalation names and contacts | To be confirmed |
| 6 | Production monitoring, metrics and alerting tooling | To be confirmed |
| 7 | Number of tenants, users per tenant, traffic volumes | To be confirmed |
| 8 | Which reports and exports exist and are in scope (S9); offline service scope (S10) | To be confirmed |
| 9 | Email provider for OTP and notifications | To be confirmed |
| 10 | Service credits, caps and legal terms | To be confirmed |
| 11 | Maintenance windows agreed with each customer | To be confirmed |
| 12 | Supported browser and device list | To be confirmed |

## 17. Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | To be confirmed | First draft for review |
