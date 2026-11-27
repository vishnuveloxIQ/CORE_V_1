# Compliance Readiness Matrix

| Field | Value |
|---|---|
| Document ID | DOC-20 |
| Title | Compliance Readiness Matrix |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Internal |

## 1. Purpose

This matrix shows how far the VeloxIQ Core application and its repository support the control themes of ISO/IEC 27001:2022 Annex A, the SOC 2 Trust Services Criteria and common data protection principles (GDPR and India DPDP style). It tells reviewers what the code already provides, what must be supplied by process or people outside the code, and what to fix first.

**Important notice.** This is a readiness view prepared from the repository. It is **not a certification, an attestation, an audit opinion or legal advice**. No certification body, auditor or lawyer has reviewed it. Ratings are an internal **Assessed** judgement and do not imply conformity with any standard. Organisational controls are outside the repository and are marked To be confirmed.

## 2. Scope

| Item | Detail |
|---|---|
| System | VeloxIQ Core: `CORE__BACKEND` (Node 24, TypeScript, Express, PostgreSQL 18) and `CORE__FRONTEND` (React 19) |
| Evidence base | Repository files only: `CORE__BACKEND/src`, `migrations`, `tests`, `docs`, `.github/workflows/ci.yml`, `scripts` |
| Not assessed | Hosting, networks, devices, HR processes, supplier contracts, physical premises, front-end runtime (beyond what is cited) |
| Companion documents | [DOC-03 Data](03-Data-Architecture-and-Governance.md), [DOC-04 Security](04-Security-Architecture-and-Controls.md), [DOC-13 Third party](13-Third-Party-Software-Inventory.md), [DOC-18 Privacy](18-Privacy-Impact-Assessment-and-Records-of-Processing.md), [DOC-21 Supplier and test scope](21-Supplier-Assessment-and-Security-Test-Scope.md) |

## 3. Rating scale

| Rating | Meaning |
|---|---|
| Ready in application | The application or repository provides the control with evidence. Operating it still needs a named owner |
| Partial | Some of the control is in the application; a gap or a dependency outside the code remains |
| Not in application | The control is outside the code (process, people, premises, provider) or absent. It needs an owner outside engineering |

All ratings in this document are marked **Assessed** (internal judgement from repository evidence, not independently validated).

## 4. ISO/IEC 27001:2022 Annex A readiness

### 4.1 Organisational controls (A.5)

| Theme (Annex A) | What the application or repository provides | Outside the code (To be confirmed) | Rating (Assessed) |
|---|---|---|---|
| A.5.1 Policies for information security | None in code. Operational notes in `CORE__BACKEND/docs/DEPLOYMENT.md` and `README.md` | Approved security policy set, owner, review cycle | Not in application |
| A.5.2 to A.5.3 Roles, segregation of duties | Privilege-based access with module, project, location and store scope (`src/modules/access/*`); approval levels up to four with distinct actors (`migrations/0034_approval_levels_max_four.sql`, `src/modules/approvals/*`); tests in `tests/permissions`, `tests/access` | Named security roles, separation between developers and operators | Partial |
| A.5.7 Threat intelligence | None | Subscription, triage owner | Not in application |
| A.5.8 Security in project management | Documented specifications and progress (`CORE__BACKEND/PROGRESS.md`, `CLAUDE.md`) | Security review gate in the delivery process | Partial |
| A.5.9 to A.5.11 Asset inventory and use | Third-party software list ([DOC-13](13-Third-Party-Software-Inventory.md)); data model in migrations | Asset register for hosts, devices, accounts | Partial |
| A.5.12 to A.5.13 Classification and labelling | Document classification in this document set; no data-classification field in the schema | Classification scheme and handling rules | Not in application |
| A.5.14 Information transfer | Event envelope and relay (`src/core/relay.ts`); inbound events restricted to administrators (`src/modules/integration/routes.ts`) | Transport decision D13, agreements with module owners | Partial |
| A.5.15 to A.5.18 Access control, identity, authentication, access rights | Login ID and Argon2id password (`src/core/password.ts`), passkeys, step-up, session list and revoke (`src/modules/auth/*`); grants, suspensions and restore recorded (`src/modules/access/*`, `migrations/0008_access.sql`); access history test (`tests/auth/access-history-device-limit.test.ts`) | Joiner/mover/leaver process, periodic access review | Partial |
| A.5.19 to A.5.22 Supplier relationships | Inventory of libraries in DOC-13; supplier questionnaire in [DOC-21](21-Supplier-Assessment-and-Security-Test-Scope.md) | Supplier register, contracts, reviews; hosting and e-mail/SMS providers not chosen | Not in application |
| A.5.23 Cloud services security | None in code; deployment notes only | Cloud provider selection, shared-responsibility record | Not in application |
| A.5.24 to A.5.28 Incident management | Request IDs on every response and log line (`docs/DEPLOYMENT.md`); append-only audit log (`migrations/0002_audit_append_only.sql`); auth events (`core_auth_activity`); audit chain verification (`src/core/audit.ts`) | Incident plan, on-call, evidence handling, reporting duties | Partial |
| A.5.29 to A.5.30 Continuity and ICT readiness | Per-tenant backup and restore (`src/db/backup.ts`); restore drill with audit-chain check (`src/db/restore-drill.ts`); drill reports (`docs/restore-drills/2026-11-21-acme.md`, `2026-11-21-beta.md`); health probes `GET /health`, `GET /health/ready` (`src/core/health.ts`) | RTO/RPO targets, backup schedule, off-site copy, DR site | Partial |
| A.5.31 Legal, statutory and contractual requirements | Privacy register in [DOC-18](18-Privacy-Impact-Assessment-and-Records-of-Processing.md) | Legal register, applicable jurisdictions | Not in application |
| A.5.32 Intellectual property | Licences listed in DOC-13 | IP policy | Partial |
| A.5.33 Protection of records | Immutable audit chain; per-row `row_version`; migration checksums in `core_migration` (`src/db/migrate.ts`) | Records retention schedule | Partial |
| A.5.34 Privacy and PII protection | See DOC-18 and section 6 below | DPO, notices, lawful basis | Partial |
| A.5.35 to A.5.36 Independent review, compliance with policies | Automated CI checks (`CORE__BACKEND/.github/workflows/ci.yml`); test scope in DOC-21 | Internal audit programme, independent test performed | Not in application |
| A.5.37 Documented operating procedures | `docs/DEPLOYMENT.md`, `docs/REGRESSION.md`, `docs/API_V1.md`, this document set | Runbooks beyond deployment | Partial |

### 4.2 People controls (A.6)

| Theme | What the application or repository provides | Outside the code (To be confirmed) | Rating (Assessed) |
|---|---|---|---|
| A.6.1 to A.6.2 Screening, terms of employment | None | HR screening, contracts, confidentiality terms | Not in application |
| A.6.3 Awareness and training | None | Security and privacy training programme | Not in application |
| A.6.4 Disciplinary process | Audit trail identifies actors (`audit_row_change.actor_id`) | Disciplinary procedure | Partial |
| A.6.5 Responsibilities after termination | User suspension and session revocation (`POST /access/users/{userId}/suspensions`, `DELETE /auth/sessions/{id}`, `core_user_session.revoked_reason`) | Leaver checklist, return of assets | Partial |
| A.6.6 Confidentiality agreements | None | NDA process | Not in application |
| A.6.7 Remote working | Short-lived access token (15 minutes), device label per session (`src/modules/auth/tokens.ts`, `core_user_session`) | Remote-working policy, endpoint controls | Partial |
| A.6.8 Event reporting | Users can raise tickets (`POST /tickets`, `core_ticket`) | Reporting channel and obligations for security events | Partial |

### 4.3 Physical controls (A.7)

| Theme | What the application or repository provides | Outside the code (To be confirmed) | Rating (Assessed) |
|---|---|---|---|
| A.7.1 to A.7.6 Perimeters, entry, offices, monitoring, secure areas | Nothing (software repository) | Data-centre or cloud provider attestations, office controls | Not in application |
| A.7.7 Clear desk and screen | Nothing | Policy | Not in application |
| A.7.8 to A.7.14 Equipment siting, off-premises, media, cabling, maintenance, disposal | Backup files described as personal data to be encrypted and kept outside the repository (`docs/DEPLOYMENT.md`) | Media handling, secure disposal, hardware lifecycle | Not in application |

### 4.4 Technological controls (A.8)

| Theme | What the application or repository provides | Outside the code (To be confirmed) | Rating (Assessed) |
|---|---|---|---|
| A.8.1 User endpoint devices | Not applicable to the server; front end is a web client | Device management | Not in application |
| A.8.2 to A.8.5 Privileged access, restriction, source code access, secure authentication | Privilege checks on every route (`guardRoute`, `admin` in `src/modules/*/routes.ts`); step-up for sensitive actions (`src/modules/auth/step-up.ts`); passkeys (`migrations/0007_passkeys.sql`); lockout and rate limits (`src/modules/auth/service.ts`, `routes.ts`); least-privilege DB role script (`scripts/admin/create-core-app-role.sql`) | Enforcement of MFA by policy; repository access control; confirm DB role applied in production | Partial |
| A.8.6 Capacity management | Load baseline script (`scripts/load-baseline.ts`); hot-path indexes (`migrations/0033_hot_path_indexes.sql`) | Capacity plan, monitoring | Partial |
| A.8.7 Protection against malware | File type allow-list and 2 MB cap (`src/modules/records/rules.ts`). No malware scan found | Scanning of uploads, endpoint protection | Partial |
| A.8.8 Technical vulnerability management | Lockfile (`package-lock.json`), library inventory (DOC-13); CI typecheck and lint | Dependency scanning, patch SLA, independent penetration test (DOC-21) | Partial |
| A.8.9 Configuration management | Environment validation at start (`src/config/env.ts`); production refuses sample OTP (`docs/DEPLOYMENT.md`); trusted proxy validation (`src/config/trust-proxy.ts`) | Baseline hardening for hosts and database | Partial |
| A.8.10 Information deletion | Delete routes for selected records (`src/core/rows.ts`); no purge job; audit log cannot be deleted | Retention and deletion schedule | Partial |
| A.8.11 Data masking | Redaction of sensitive keys in logs and audit snapshots (`src/core/redaction.ts`); `ip_hash` in audit | Masking in non-production data | Partial |
| A.8.12 Data leakage prevention | `Cache-Control: no-store`, CSP, CORS allow-list (`src/plugins/security-headers.ts`, `cors.ts`); events do not show payload in the monitor | DLP tooling | Partial |
| A.8.13 Information backup | `npm run db:backup`, `db:restore`, `db:drill` (`package.json`); tests `tests/hardening/backup.test.ts`, `restore-drill.test.ts` | Schedule, encryption, off-site storage, global-schema dump | Partial |
| A.8.14 Redundancy | Several instances supported: shared rate-limit table, row-locked reminders and relay (`src/core/rate-limit-store.ts`, `src/core/relay.ts`) | Database high availability, load balancer | Partial |
| A.8.15 Logging | Pino JSON logs with request ID; append-only audit chain; auth events (`src/core/audit.ts`, `docs/DEPLOYMENT.md`) | Central log platform, retention, review | Partial |
| A.8.16 Monitoring activities | Probes, event summary (`GET /integration-events/summary`), sync status (`GET /ref-records/sync-status`) | Alerting, SIEM, on-call | Partial |
| A.8.17 Clock synchronisation | Server timestamps in the database | NTP at host level | Not in application |
| A.8.18 Privileged utility programs | Admin CLIs are separate scripts (`src/db/*-cli.ts`, `src/modules/access/cli.ts`) | Control over who may run them | Partial |
| A.8.19 to A.8.20 Software installation, network security | Not in code | Network segmentation, firewall, TLS termination (required in front of the API) | Not in application |
| A.8.21 to A.8.22 Network services, segregation | Tenant segregation by schema (`src/db/tenant.ts`) | Network zones | Partial |
| A.8.23 Web filtering | Not applicable | n/a | Not in application |
| A.8.24 Use of cryptography | Argon2id hashing; JWT signing with `JWT_SECRET` (at least 32 characters in production); WebAuthn; SHA-256 file hashes; HSTS in production | Key management and rotation, encryption at rest and in transit between internal hops | Partial |
| A.8.25 to A.8.27 Secure development lifecycle, architecture, coding | TypeScript strict build, lint, Zod validation on inputs (`src/core/validation.ts`), parameterised queries, CI (`.github/workflows/ci.yml`), 77 test files under `CORE__BACKEND/tests` | Threat modelling record, secure coding standard | Partial |
| A.8.28 Secure coding | Input schemas per route (`src/modules/*/schema.ts`); error handler hides internals (`src/core/error-handler.ts`) | Static analysis beyond lint | Partial |
| A.8.29 Security testing in development and acceptance | Unit, integration, regression, isolation, audit-chain, auth edge tests (`tests/`); API v1 lock (`tests/regression/api-v1-lock.test.ts`) | Independent penetration test (scope in DOC-21) | Partial |
| A.8.30 Outsourced development | Not determinable | Contracts and oversight | Not in application |
| A.8.31 Separation of environments | `.env.example`, `.env.test`; production-only checks in `src/config/env.ts` | Separate infrastructure for development, test, production | Partial |
| A.8.32 Change management | Migrations with checksums, edited migrations refused (`src/db/migrate.ts`); API lock test; Git history | Change approval record, release process | Partial |
| A.8.33 Test information | Demo and seed loaders (`scripts/load-demo-data.mjs`, `load-frontend-seed.mjs`); `.env.test` | Rule that production data is not used for testing | Partial |
| A.8.34 Protection during audit testing | Audit log is append-only | Test-time safeguards | Partial |

## 5. SOC 2 Trust Services Criteria readiness

SOC 2 is an attestation by a licensed CPA firm. Nothing here is an attestation. The mapping shows where repository evidence can support a future examination.

### 5.1 Security (Common Criteria)

| Criteria group | What the application or repository provides | Outside the code (To be confirmed) | Rating (Assessed) |
|---|---|---|---|
| CC1 Control environment | None in code | Governance, board oversight, ethics, HR | Not in application |
| CC2 Communication and information | Documentation set under `docs/`; API contract `docs/api/openapi-v1.json`; `docs/API_V1.md` | Policy communication, customer commitments | Partial |
| CC3 Risk assessment | Risk table in DOC-18 (privacy only) | Enterprise risk register and review | Not in application |
| CC4 Monitoring of controls | CI tests and regression scripts (`package.json`: `ci`, `test:regression`); restore drills | Ongoing control monitoring, internal audit | Partial |
| CC5 Control activities | Automated controls in code (guards, validation, limits) | Policy-driven control activities | Partial |
| CC6.1 to CC6.3 Logical access | Authentication, authorisation, scope, session revoke, suspensions, tenant isolation (`src/modules/auth/*`, `access/*`, `src/db/tenant.ts`, `tests/testing-pass/tenant-isolation.test.ts`) | Access reviews, provisioning workflow | Ready in application |
| CC6.4 to CC6.5 Physical access, disposal | None | Provider evidence | Not in application |
| CC6.6 Boundary protection | Security headers, CORS allow-list, rate limit, trusted-proxy handling (`src/plugins/*`, `src/config/trust-proxy.ts`) | Firewall, WAF, TLS termination | Partial |
| CC6.7 Transmission protection | HSTS in production; TLS required in front of the API (`docs/DEPLOYMENT.md`) | TLS configuration evidence | Partial |
| CC6.8 Malicious software | Upload allow-list; no scanner | Endpoint and upload scanning | Partial |
| CC7.1 to CC7.2 Detection, monitoring | Logs, audit chain, auth events, request IDs | Alerting and review | Partial |
| CC7.3 to CC7.5 Incident response and recovery | Evidence sources and recovery tooling exist | Incident plan, post-incident review | Partial |
| CC8.1 Change management | Checksummed migrations, CI, API lock | Approval workflow, segregation of release duties | Partial |
| CC9 Risk mitigation, vendors | DOC-13, DOC-21 questionnaire | Vendor management programme | Not in application |

### 5.2 Availability

| Criteria | What the application or repository provides | Outside the code (To be confirmed) | Rating (Assessed) |
|---|---|---|---|
| A1.1 Capacity | Hot-path indexes, load baseline script, shared rate limit | Capacity monitoring and forecasts | Partial |
| A1.2 Environmental protections, backup, recovery infrastructure | Per-tenant backup and restore, drill tool (`src/db/backup.ts`, `restore-drill.ts`) | Hosting resilience, backup schedule, replication | Partial |
| A1.3 Recovery testing | Two drills dated 2026-11-21 (tenants `acme`, `beta`), both with audit chain intact in source and restored copy (`docs/restore-drills/`) | Regular schedule and sign-off | Partial |
| Health and graceful operation | Liveness and readiness probes (`src/core/health.ts`) | Uptime SLO and monitoring | Partial |

### 5.3 Processing integrity

| Criteria | What the application or repository provides | Outside the code (To be confirmed) | Rating (Assessed) |
|---|---|---|---|
| PI1.1 Definitions of processing | OpenAPI contract (156 paths) and API lock test (`tests/regression/api-v1-lock.test.ts`, `scripts/api-snapshot.ts`) | Customer-facing service description | Ready in application |
| PI1.2 Input validation | Zod schemas per route; required `Idempotency-Key` on writes; optimistic concurrency by `row_version` (`src/core/validation.ts`, `idempotency.ts`; tests `tests/testing-pass/idempotency*.test.ts`, `conflicts-and-ownership.test.ts`) | Business rule sign-off | Ready in application |
| PI1.3 Processing accuracy and completeness | Database constraints (`migrations/0003_approved_constraints.sql`, `0004`), transactions per request, outbox with at-least-once delivery and per-aggregate order (`src/core/relay.ts`) | Reconciliation with consuming modules | Partial |
| PI1.4 to PI1.5 Output and storage | Immutable audit chain; chain verification; backup fingerprints | Output review process | Partial |

### 5.4 Confidentiality

| Criteria | What the application or repository provides | Outside the code (To be confirmed) | Rating (Assessed) |
|---|---|---|---|
| C1.1 Identify and maintain confidential information | Sensitive-key redaction (`src/core/redaction.ts`); document classification | Classification policy | Partial |
| C1.2 Disposal of confidential information | Delete routes for some records; no purge job; audit not erasable | Retention and disposal procedure, backup expiry | Partial |
| Tenant confidentiality | Schema-per-tenant; isolation tests | Independent isolation test (DOC-21) | Ready in application |

### 5.5 Privacy

| Criteria | What the application or repository provides | Outside the code (To be confirmed) | Rating (Assessed) |
|---|---|---|---|
| P1 Notice | None found | Privacy notice | Not in application |
| P2 Choice and consent | None found (no consent records) | Consent approach if relied on | Not in application |
| P3 Collection | Minimal identifiers in schema; no government ID, DOB or bank columns ([DOC-18](18-Privacy-Impact-Assessment-and-Records-of-Processing.md) section 5) | Collection policy | Partial |
| P4 Use, retention, disposal | Use limited by privileges; no purge job | Retention schedule | Partial |
| P5 Access | Users read own profile and sessions; no full data export | Access request procedure | Partial |
| P6 Disclosure and notification | Admin-only inbound events; no disclosure register | Sub-processor and recipient register | Partial |
| P7 Quality | PATCH correction routes | None | Ready in application |
| P8 Monitoring and enforcement | Audit log; no complaint workflow | Complaint handling | Partial |

## 6. Data protection principles (GDPR and DPDP style)

This is a principle-level readiness view, not a legal analysis. Jurisdiction and role (controller or processor) are To be confirmed.

| Principle or obligation | What the application or repository provides | Outside the code (To be confirmed) | Rating (Assessed) |
|---|---|---|---|
| Lawfulness, fairness, transparency | Processing register drafted in DOC-18; no notice or consent features | Lawful basis per activity, privacy notice | Not in application |
| Purpose limitation | Purposes documented in DOC-18 | Approval of purposes | Partial |
| Data minimisation | Schema holds limited identifiers; free text unrestricted | Review of free-text fields and event payloads | Partial |
| Accuracy | Correction routes, optimistic concurrency | Data quality checks | Ready in application |
| Storage limitation | Token, OTP and idempotency expiry only; no purge | Retention schedule and purge job | Not in application |
| Integrity and confidentiality | Argon2id, tenant isolation, redaction, audit chain, headers ([DOC-04](04-Security-Architecture-and-Controls.md)) | Encryption at rest, key custody | Partial |
| Accountability | Audit chain, tests, drills, this document set | DPO, records owner, DPIA sign-off | Partial |
| Data subject rights: access | Own-profile endpoints; no export | Procedure | Partial |
| Data subject rights: rectification | PATCH routes | None | Ready in application |
| Data subject rights: erasure | No user delete route, no anonymisation function; audit not erasable | Decision and procedure | Not in application |
| Data subject rights: portability, objection | None | Decision and procedure | Not in application |
| Records of processing | DOC-18 register | Review and ownership | Partial |
| Data protection by design and default | Tenant isolation, redaction, `ip_hash`, raw IP not stored | DPIA sign-off | Partial |
| Security of processing | See sections 4 and 5 | See sections 4 and 5 | Partial |
| Breach detection and notification | Audit, auth events, request IDs | Breach procedure and notification clock | Partial |
| Processor and sub-processor management | DOC-13 for libraries; DOC-21 questionnaire | Contracts, register | Not in application |
| International transfers | Not determinable | Hosting region, transfer mechanism | Not in application |
| Children's data | Not applicable to the schema (no age data) | Confirm | Not in application |

## 7. Summary of ratings (Assessed)

| Framework | Ready in application | Partial | Not in application |
|---|---|---|---|
| ISO/IEC 27001:2022 Annex A themes (rows in section 4) | 0 | Majority | Policy, supplier, physical, training and legal rows |
| SOC 2 (section 5) | Logical access, processing definitions and validation, tenant confidentiality, quality | Most security, availability and privacy rows | Governance, physical, notice and consent rows |
| Data protection principles (section 6) | Accuracy, rectification | Most principle rows | Transparency, storage limitation, erasure, portability, transfers, processors |

The application is strongest in logical access control, tenant isolation, audit integrity, input validation and recoverability evidence. It is weakest in retention and deletion, data subject tooling, notices, supplier governance and everything physical or organisational.

## 8. Evidence index

All paths are relative to `C:\VELOX_IQ\CORE\CORE__V__0.4\CORE__BACKEND` unless stated.

| Evidence | Location | How to obtain or re-run |
|---|---|---|
| Audit chain verification | `src/core/audit.ts` (`verifyAuditChain`); tests `tests/db/audit.test.ts`, `tests/testing-pass/audit-chain.test.ts`; used inside the restore drill | `npx vitest run tests/testing-pass/audit-chain.test.ts`; `npm run db:drill -- <tenantId>` reports "Audit chain: ... intact" |
| Audit append-only enforcement | `migrations/0002_audit_append_only.sql` (triggers `audit_row_change_no_update_delete`, `audit_row_change_no_truncate`) | `tests/db/audit.test.ts` |
| Restore drills | `docs/restore-drills/2026-11-21-acme.md`, `2026-11-21-beta.md`; `src/db/restore-drill.ts`; `tests/hardening/restore-drill.test.ts` | `npm run db:drill` |
| Backup and restore | `src/db/backup.ts`, `backup-cli.ts`; `tests/hardening/backup.test.ts`; `docs/DEPLOYMENT.md` | `npm run db:backup`, `db:restore` |
| API v1 lock | `tests/regression/api-v1-lock.test.ts`, `scripts/api-snapshot.ts`, `docs/api/openapi-v1.json`, `docs/REGRESSION.md`, `tests/hardening/openapi.test.ts` | `npm run test:regression:api` |
| Tenant isolation | `tests/testing-pass/tenant-isolation.test.ts`, `tests/db/tenant.test.ts` | `npx vitest run tests/testing-pass/tenant-isolation.test.ts` |
| Authentication and sessions | `tests/auth/*` (passkey, password reset, token lifecycle, step-up, e-mail OTP), `tests/testing-pass/auth-edges.test.ts` | `npm run test:regression:identity` |
| Permissions and access | `tests/permissions`, `tests/access`, `tests/relationships` | `npx vitest run tests/permissions tests/access` |
| Rate limiting and headers | `tests/core/rate-limit.test.ts`, `tests/hardening/shared-rate-limit.test.ts`, `headers-and-limits.test.ts`, `cors.test.ts`, `trust-proxy.test.ts` | `npx vitest run tests/hardening` |
| Idempotency and conflicts | `tests/testing-pass/idempotency*.test.ts`, `conflicts-and-ownership.test.ts` | as above |
| Logging redaction | `tests/core/logging.test.ts`; `src/core/redaction.ts` | `npx vitest run tests/core/logging.test.ts` |
| Event relay and integration | `tests/integration/events.test.ts`, `tests/db/integration.test.ts` | `npx vitest run tests/integration` |
| CI pipeline | `.github/workflows/ci.yml` (typecheck, lint, tests incl. restore drill, build, JUnit results) | Pipeline run history (location To be confirmed) |
| Full gate | `npm run ci` in `package.json` | Run locally or in CI |
| Migrations and checksums | `migrations/*.sql`, `src/db/migrate.ts`, `core_migration` table; `tests/db/migrate.test.ts` | `npm run db:migrate` |
| Deployment controls | `docs/DEPLOYMENT.md` (go-live checklist) | Review |
| Third-party inventory | [DOC-13](13-Third-Party-Software-Inventory.md) | Review |
| Privacy register | [DOC-18](18-Privacy-Impact-Assessment-and-Records-of-Processing.md) | Review |
| Security architecture | [DOC-04](04-Security-Architecture-and-Controls.md) | Review |

## 9. Remediation backlog (ordered by priority)

Priority: P1 do before production or first customer data; P2 within the first quarter of operation; P3 planned improvement. Owners and dates are To be confirmed.

| # | Priority | Gap | Frameworks | Action | Owner |
|---|---|---|---|---|---|
| 1 | P1 | Production database role not confirmed (noted as an open item in `docs/DEPLOYMENT.md`) | ISO A.8.2, SOC 2 CC6.1 | Apply `scripts/admin/create-core-app-role.sql`; run the app with that role; record evidence | To be confirmed |
| 2 | P1 | Password-reset provider not chosen (decision D10); reset answers 503 in production | ISO A.5.17, SOC 2 CC6.1 | Select provider using DOC-21 questionnaire; wire in; remove `SAMPLE_OTP_CODE` | To be confirmed |
| 3 | P1 | Independent penetration test not performed | ISO A.8.8, A.8.29; SOC 2 CC4, CC7 | Run test per DOC-21 scope; track findings to closure | To be confirmed |
| 4 | P1 | Backup schedule, encryption, off-site copy and global-schema dump not evidenced | ISO A.8.13; SOC 2 A1.2 | Define schedule and RTO/RPO; encrypt; store off-site; schedule `db:drill` and alert on exit code 1 | To be confirmed |
| 5 | P1 | Hosting, region and sub-processors unknown | ISO A.5.19 to A.5.23; GDPR transfers | Record provider, region, contracts, certifications | To be confirmed |
| 6 | P2 | No retention schedule or purge job | ISO A.8.10; GDPR storage limitation; SOC 2 P4, C1.2 | Define periods per data class; implement purge for sessions, auth events, notifications, events, expired keys | To be confirmed |
| 7 | P2 | No erasure, anonymisation or export capability | GDPR rights; SOC 2 P5 | Decide approach with DPO; implement or document a controlled procedure | To be confirmed |
| 8 | P2 | No privacy notice or consent handling | GDPR transparency; SOC 2 P1, P2 | Prepare notice; decide whether consent is used | To be confirmed |
| 9 | P2 | Central logging, alerting and incident plan absent | ISO A.5.24, A.8.15, A.8.16; SOC 2 CC7 | Choose log platform, alert rules, incident runbook | To be confirmed |
| 10 | P2 | Encryption at rest and key management undefined | ISO A.8.24; GDPR security | Confirm database and storage encryption; define secret rotation for `JWT_SECRET` | To be confirmed |
| 11 | P2 | MFA not enforced by policy (passkeys optional) | ISO A.8.5 | Decide enforcement for administrators | To be confirmed |
| 12 | P2 | Upload content scanning absent (type allow-list and size cap only) | ISO A.8.7; SOC 2 CC6.8 | Add malware scan or content validation in the storage path | To be confirmed |
| 13 | P2 | Dependency vulnerability scanning not in CI | ISO A.8.8 | Add audit step and patch policy | To be confirmed |
| 14 | P3 | Information security policy set, roles, training, HR controls | ISO A.5.1, A.6 | Draft and approve policies; schedule training | To be confirmed |
| 15 | P3 | Supplier register and review cycle | ISO A.5.19 to A.5.22; SOC 2 CC9 | Maintain register; use DOC-21 template annually | To be confirmed |
| 16 | P3 | Event transport (D13) and data-sharing terms with HRMS, P&M, PMS, Stores | ISO A.5.14; GDPR recipients | Select transport; agree payload minimisation | To be confirmed |
| 17 | P3 | Raw IP not stored in auth events pending retention decision | ISO A.8.15 | Decide whether IP capture is needed; set retention | To be confirmed |
| 18 | P3 | Physical and environmental controls | ISO A.7 | Obtain provider attestations | To be confirmed |

## 10. Open items

| # | Item | Owner |
|---|---|---|
| 1 | Document owner, approver and review cycle | To be confirmed |
| 2 | Target certifications or attestations (ISO 27001, SOC 2 type and period) and scope boundary | To be confirmed |
| 3 | Applicable jurisdictions and the controller or processor position | To be confirmed |
| 4 | Hosting vendor, e-mail/SMS/OTP vendor and their certifications | To be confirmed |
| 5 | Location of CI run history and any other operational evidence not in the repository | To be confirmed |
| 6 | Owners and dates for each backlog item | To be confirmed |
| 7 | Whether a qualified assessor will validate the Assessed ratings | To be confirmed |

## 11. Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | To be confirmed | First draft from repository review |
