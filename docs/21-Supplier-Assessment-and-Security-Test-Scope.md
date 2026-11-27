# Supplier Assessment and Security Test Scope

| Field | Value |
|---|---|
| Document ID | DOC-21 |
| Title | Supplier Assessment and Security Test Scope |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Confidential |

## 1. Purpose

This document has two parts.

- **Part A** is a supplier and third-party assessment questionnaire template for any supplier of hosting, e-mail/SMS/OTP delivery or software that VeloxIQ Core depends on.
- **Part B** defines the scope and rules of engagement for an independent penetration test and security assessment of the VeloxIQ Core application.

## 2. Scope

| Item | Detail |
|---|---|
| System | VeloxIQ Core: `CORE__BACKEND` (Node 24, TypeScript, Express, PostgreSQL 18) and `CORE__FRONTEND` (React 19), multi-tenant with one schema per tenant |
| Part A applies to | Hosting and database providers, e-mail/SMS/OTP providers (decision D10, not yet chosen, see `CORE__BACKEND/docs/DEPLOYMENT.md`), event transport provider (decision D13, see `CORE__BACKEND/src/core/relay.ts`), backup storage, monitoring and logging providers, and software suppliers listed in [DOC-13](13-Third-Party-Software-Inventory.md) |
| Part B applies to | The application and its API in a **non-production** environment, as described in section 13 |
| Related documents | [DOC-04 Security](04-Security-Architecture-and-Controls.md), [DOC-03 Data](03-Data-Architecture-and-Governance.md), [DOC-18 Privacy](18-Privacy-Impact-Assessment-and-Records-of-Processing.md), [DOC-20 Readiness](20-Compliance-Readiness-Matrix.md) |

No supplier name, hosting vendor or certification is stated in the repository; all such facts are **To be confirmed** (section 23).

---

# Part A. Supplier and third-party assessment questionnaire template

## 3. How to use Part A

| Step | Action |
|---|---|
| 1 | Classify the supplier with the tiering table (section 4) |
| 2 | Send sections 5 to 12 that apply to the supplier; Tier 1 gets all sections |
| 3 | Require evidence for every "Yes" (policy, report, certificate, contract clause) |
| 4 | Score each answer: Met, Partly met, Not met, Not applicable |
| 5 | Record the outcome in section 12 and re-assess at least annually or on material change |

## 4. Supplier tiering

| Tier | Criteria | Examples for Core | Depth |
|---|---|---|---|
| 1 Critical | Stores or processes tenant personal data, or its failure stops Core | Database or hosting provider, backup storage | Full questionnaire, evidence, contract review |
| 2 Important | Handles limited personal data (for example e-mail address plus a one-time code) or security-relevant traffic | E-mail/SMS/OTP provider (`src/modules/auth/email-otp.ts` carries code and expiry only), event transport, logging platform | Sections 5 to 11 |
| 3 Standard | No personal data, replaceable | Development tools, open-source libraries (see DOC-13) | Sections 5, 6 and 11 abridged |

## 5. Supplier profile

| # | Question | Answer | Evidence | Score |
|---|---|---|---|---|
| 5.1 | Legal name, registered address, country of operation | | | |
| 5.2 | Service provided to VeloxIQ Core and tier | | | |
| 5.3 | Data the supplier will receive, store or process (categories, volumes) | | | |
| 5.4 | Data locations (regions, data centres) and any change process | | | |
| 5.5 | Named security and privacy contacts | | | |
| 5.6 | Ownership, financial standing, and any pending acquisition | | | |

## 6. Information security

| # | Question | Answer | Evidence | Score |
|---|---|---|---|---|
| 6.1 | Documented information security policy approved by management, with review date | | | |
| 6.2 | Independent security certification or attestation in force (for example ISO/IEC 27001, SOC 2 Type II) with scope and period | | | |
| 6.3 | Date and summary of the latest independent penetration test; remediation status | | | |
| 6.4 | Encryption in transit (protocol versions) and at rest (algorithm, key custody, rotation) | | | |
| 6.5 | Authentication for supplier administrators (MFA enforced), privileged access reviews | | | |
| 6.6 | Logical separation between customers (multi-tenancy model) | | | |
| 6.7 | Vulnerability and patch management with timelines by severity | | | |
| 6.8 | Secure development practices, code review, dependency scanning | | | |
| 6.9 | Logging and monitoring, log retention, customer access to logs | | | |
| 6.10 | Personnel screening, confidentiality terms, security training | | | |
| 6.11 | Physical security of facilities (or attestation from the underlying provider) | | | |
| 6.12 | Network security (segmentation, firewalling, DDoS protection) | | | |

## 7. Privacy and data protection

| # | Question | Answer | Evidence | Score |
|---|---|---|---|---|
| 7.1 | Role of the supplier (processor, sub-processor, independent controller) | | | |
| 7.2 | Data processing agreement offered and its key terms | | | |
| 7.3 | Applicable data protection laws and regulatory registrations | | | |
| 7.4 | Purposes for which data is used; confirmation it is not used for supplier's own purposes (for example analytics or model training) | | | |
| 7.5 | Cross-border transfers and the legal mechanism relied on | | | |
| 7.6 | Support for data subject requests (access, correction, deletion, export) and response times | | | |
| 7.7 | Data retention and deletion at end of service, with certificate of deletion | | | |
| 7.8 | Privacy impact assessments performed for the service | | | |
| 7.9 | Government or law-enforcement access requests policy | | | |

## 8. Availability and resilience

| # | Question | Answer | Evidence | Score |
|---|---|---|---|---|
| 8.1 | Contractual availability target and credits; historic availability for 12 months | | | |
| 8.2 | Redundancy (zones, regions), single points of failure | | | |
| 8.3 | Backup frequency, retention, encryption, location | | | |
| 8.4 | Recovery time and recovery point objectives, date of last restore test | | | |
| 8.5 | Capacity management and rate limits applicable to VeloxIQ | | | |
| 8.6 | Maintenance windows and notice period | | | |
| 8.7 | Support hours, escalation path, response times by severity | | | |
| 8.8 | Business continuity and disaster recovery plan tested within 12 months | | | |

## 9. Subcontractors and supply chain

| # | Question | Answer | Evidence | Score |
|---|---|---|---|---|
| 9.1 | List of sub-processors and subcontractors with service and location | | | |
| 9.2 | Notice period and right to object before a new sub-processor is added | | | |
| 9.3 | Flow-down of security and privacy obligations to sub-processors | | | |
| 9.4 | Open-source and third-party components used in the service; software bill of materials available | | | |
| 9.5 | Dependency on other cloud providers (fourth parties) | | | |

## 10. Incident handling

| # | Question | Answer | Evidence | Score |
|---|---|---|---|---|
| 10.1 | Documented incident response plan and last exercise date | | | |
| 10.2 | Breach notification commitment to VeloxIQ (maximum hours from discovery) | | | |
| 10.3 | Information provided in a notification (scope, data affected, timeline, mitigation) | | | |
| 10.4 | Security incidents affecting customers in the last 36 months and lessons learned | | | |
| 10.5 | Forensic readiness: log preservation, ability to support a joint investigation | | | |
| 10.6 | Customer-facing status page and communication channels | | | |

## 11. Service-specific questions

### 11.1 E-mail, SMS and OTP delivery supplier (decision D10)

| # | Question | Answer | Evidence | Score |
|---|---|---|---|---|
| 11.1.1 | Is message content retained, and for how long? (Core sends code and expiry only: `src/modules/auth/email-otp.ts`) | | | |
| 11.1.2 | Sender authentication (SPF, DKIM, DMARC) or sender registration for SMS | | | |
| 11.1.3 | Delivery reliability, latency targets (reset code is valid for 5 minutes: `src/modules/auth/password-reset.ts`) | | | |
| 11.1.4 | API authentication, key scope, key rotation, IP allow-listing | | | |
| 11.1.5 | Protection against abuse, throttling and number or address enumeration | | | |
| 11.1.6 | Bounce, complaint and failure reporting without exposing code values | | | |
| 11.1.7 | Regulatory registrations for SMS (for example sender and template registration where required) | | | |

### 11.2 Hosting, database and backup supplier

| # | Question | Answer | Evidence | Score |
|---|---|---|---|---|
| 11.2.1 | Supported PostgreSQL version (Core targets 18) and `pg_dump`/`pg_restore` compatibility (`docs/DEPLOYMENT.md`) | | | |
| 11.2.2 | Ability to run per-tenant schema backups and restore drills, and to create scratch databases (`src/db/restore-drill.ts`) | | | |
| 11.2.3 | Encryption at rest of database volumes and backups; customer-managed keys | | | |
| 11.2.4 | Network isolation of the database; no public endpoint | | | |
| 11.2.5 | Support for TLS termination with HSTS in front of the API and trusted-proxy configuration (`src/config/trust-proxy.ts`) | | | |
| 11.2.6 | Secret store for `JWT_SECRET` and database credentials | | | |
| 11.2.7 | Administrator access to customer data: who, how approved, how logged | | | |

### 11.3 Software or library supplier

| # | Question | Answer | Evidence | Score |
|---|---|---|---|---|
| 11.3.1 | Licence and permitted use (see DOC-13) | | | |
| 11.3.2 | Security advisory process and typical fix time | | | |
| 11.3.3 | Release and end-of-life policy | | | |
| 11.3.4 | Signing of releases and integrity checks | | | |
| 11.3.5 | Telemetry or outbound calls made by the software | | | |

### 11.4 Event transport supplier (decision D13)

| # | Question | Answer | Evidence | Score |
|---|---|---|---|---|
| 11.4.1 | Delivery semantics (Core relay is at-least-once with per-aggregate order: `src/core/relay.ts`) | | | |
| 11.4.2 | Message retention, encryption, per-tenant separation of topics or queues | | | |
| 11.4.3 | Authentication between Core, the transport and consuming modules | | | |

## 12. Certifications, exit and outcome

### 12.1 Certifications and attestations

| Certification or report | Held (Yes/No) | Scope | Valid until | Evidence reference |
|---|---|---|---|---|
| ISO/IEC 27001 | | | | |
| ISO/IEC 27017 or 27018 | | | | |
| SOC 2 Type II | | | | |
| Local regulatory registrations | | | | |

### 12.2 Exit and termination

| # | Question | Answer | Evidence | Score |
|---|---|---|---|---|
| 12.2.1 | Data return format and timeline on termination | | | |
| 12.2.2 | Verified deletion of all copies including backups, with deletion certificate and timeline | | | |
| 12.2.3 | Transition support and cost | | | |
| 12.2.4 | Notice period, minimum term, lock-in or proprietary formats | | | |
| 12.2.5 | Continuity if the supplier ceases trading (escrow or equivalent) | | | |

### 12.3 Assessment outcome

| Field | Value |
|---|---|
| Supplier | |
| Tier | |
| Assessor and date | |
| Overall result | Accept / Accept with conditions / Reject |
| Conditions and due dates | |
| Next review date | |
| Approver | To be confirmed |

---

# Part B. Independent penetration test and security assessment: scope and rules of engagement

## 13. Objectives and engagement model

| Item | Statement |
|---|---|
| Objective | Provide independent assurance that the application resists realistic attacks, with special attention to tenant isolation, authentication, authorisation, file handling and the inbound integration endpoints |
| Type | Grey-box: the tester receives the API contract, role descriptions and test accounts, but no source privileges unless agreed |
| Environment | A dedicated non-production environment that mirrors production configuration (`NODE_ENV=production` behaviour, TLS in front, security headers, trusted proxy). Production is **not** to be tested unless the owner states otherwise in writing |
| Data | Synthetic data only. The repository provides demo and seed loaders (`CORE__BACKEND/scripts/load-demo-data.mjs`, `load-frontend-seed.mjs`) that can build fictional data (To be confirmed which is used) |
| Authorisation | Written authorisation by the system owner (To be confirmed) before any activity; named tester list; source IP addresses supplied to the owner |
| Test window | To be confirmed |
| Tester | To be confirmed (independent of the development team) |

## 14. In-scope components

### 14.1 API route groups

Derived from `CORE__BACKEND/docs/api/openapi-v1.json` (156 paths, grouped by first path segment). The contract is also served at `GET /openapi.json`.

| Group | Representative paths | Why it matters |
|---|---|---|
| Authentication (19 paths) | `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/me/access`, `/auth/change-password`, `/auth/password-reset/request`, `/auth/password-reset/confirm`, `/auth/passkeys/*`, `/auth/sessions`, `/auth/sessions/{id}`, `/auth/step-up/*` | Credential attacks, session handling, passkey and step-up logic, account enumeration |
| Users and access | `/users`, `/users/{id}`, `/users/{id}/password-reset`, `/access/users/{userId}`, `/access/users/{userId}/grants`, `/access/grants/{id}`, `/access/users/{userId}/suspensions`, `/access/suspensions/{id}/restore` | Privilege escalation, horizontal access, suspension bypass |
| Organisation | `/organisation/company-profile`, `/organisation/departments`, `/organisation/positions`, `/organisation/holidays`, `/organisation/shifts`, `/organisation/number-series` | Admin-only writes, mass assignment |
| Projects and locations | `/projects`, `/locations`, `/stores`, `/chainage-markers`, `/wbs-nodes`, `/milestones`, `/boq-items`, `/plan-lines` | Scope by project, location and store |
| Masters | `/materials`, `/vendors`, `/vendors/{id}/verify`, `/equipment-types`, `/equipment-units`, `/equipment-assignments`, `/geo-zones`, `/uoms`, `/stock-levels`, `/major-material-allocations`, `/maintenance-schedules` | Object-level authorisation, business logic (vendor verification) |
| Policies and rules | `/policies`, `/policy-versions` (publish), `/policy-rules`, `/policy-rules/{id}/acknowledge`, `/custom-policies`, `/custom-policy-fields`, `/custom-policy-versions`, `/ot-policies`, `/ot-policy-rules`, `/leave-types`, `/leave-policies`, `/leave-policy-rules`, `/cash-limit-rows`, `/pms-limit-rows` | Versioning and publish state, tampering |
| Approvals | `/approval-chains`, `/matrix-versions` (publish), `/matrix-levels`, `/approval-requests`, `/approval-requests/{id}/actions`, `/approval-requests/{id}/publish` | Workflow bypass, self-approval, level skipping, amount tampering |
| Records | `/grievances`, `/tickets`, `/notifications`, `/record-timeline`, `/document-templates`, `/offer-letter/revisions` | Sensitive free text, recipient scoping |
| Files | `/files`, `/files/{id}`, `/files/{id}/content` (PUT and GET) | Upload validation, authorisation, content type confusion |
| Bulk import | `/import-batches`, `/import-batches/{id}/rows`, `/import-batches/{id}/submit`, `/import-rows` | Injection through bulk data, row-level checks |
| Offline sync | `/offline-operations` | Replay, spoofed device keys, cross-user writes |
| Integration | `/integration-events`, `/integration-events/inbound`, `/integration-events/summary`, `/integration-events/{id}`, `/integration-events/{id}/replay`, `/ref-records`, `/ref-records/sync-status` | Forged inbound events, replay abuse, payload exposure |
| Audit | `/audit-log`, `/audit-log/{id}`, `/audit-log/auth-events`, `/audit-log/external` | Audit visibility, forged external entries, tamper resistance |
| Search and usage | `/search`, `/usage-counters`, `/usage-counters/increment` | Cross-tenant leakage, scope filtering |
| Platform | `/health`, `/health/ready`, `/openapi.json` | Information disclosure |

### 14.2 Cross-cutting components

| Component | What to test | Source |
|---|---|---|
| Multi-tenant isolation | Token tenant claim, `X-Tenant-Id` on login and refresh only, schema separation | `CORE__BACKEND/src/db/tenant.ts`, `src/plugins/auth.ts`, `src/modules/auth/schema.ts` (`tenantFromHeader`) |
| Authentication flows | Password login, lockout (15 minutes), rate limits, refresh rotation, logout, session revoke, change password, reset by code, passkey register and login, step-up (password and passkey) | `src/modules/auth/*` |
| Authorisation | Privilege guards on every route, scope by project, location and store | `src/modules/access/*`, `src/modules/*/routes.ts` |
| File upload | 2 MB cap, six permitted media types, declared length versus body, filename handling, download headers | `src/modules/records/routes.ts`, `rules.ts` |
| Event inbound endpoint | `POST /integration-events/inbound`: source module enumeration (`hrms`, `pm`, `pms`, `stores`), idempotency, stale and duplicate handling, replay | `src/modules/integration/*`, `src/core/events.ts` |
| Audit external endpoint | `POST /audit-log/external`: privilege (`access.manage`), field constraints, ability to forge or flood the chain | `src/modules/audit-log/*` |
| Audit chain integrity | Append-only triggers and hash chain cannot be broken through the API | `migrations/0002_audit_append_only.sql`, `src/core/audit.ts` |
| Transport and headers | TLS, HSTS, CSP, X-Frame-Options, CORS allow-list, cache directives | `src/plugins/security-headers.ts`, `cors.ts`, `docs/DEPLOYMENT.md` |
| Rate limiting | Global 600 per minute per client address; login and reset limits; proxy header trust | `src/plugins/rate-limit.ts`, `src/config/trust-proxy.ts`, `src/modules/auth/routes.ts` |
| Idempotency and concurrency | Key reuse, replay for 24 hours, `row_version` conflicts | `src/core/idempotency.ts` |
| Error handling and logging | No stack traces or SQL in responses, no secrets in logs | `src/core/error-handler.ts`, `src/core/redaction.ts` |
| Front end | XSS, token storage, route guards, CSP interaction, source-map exposure | `CORE__FRONTEND/src` |
| Configuration | Production start checks, sample OTP refused, secret length | `src/config/env.ts` |

## 15. Out of scope

| Item | Reason |
|---|---|
| Production environment and real tenant data | Safety; use non-production |
| Denial of service and volumetric load tests | Not authorised unless a separate load-test plan is agreed; rate-limit logic itself is in scope at low volume |
| Physical, social engineering and phishing of staff | Not part of this engagement |
| Hosting provider's infrastructure, cloud console and shared platform | Supplier responsibility; covered by Part A |
| Third-party libraries' own source code (see DOC-13) | Dependency-level findings are reported but libraries are not fault-tested |
| HRMS, P&M, PMS and Stores applications | Separate systems; only Core's endpoints for them are in scope |
| E-mail/SMS provider platform | Supplier responsibility |
| Developer workstations and source repository hosting | Not part of this engagement |
| Testing from or against any non-listed IP or host | Not authorised |

## 16. Test accounts approach

| Rule | Statement |
|---|---|
| Creation | Test credentials must be created in the non-production environment, by the environment owner, for this engagement only. The repository offers an admin CLI for provisioning (`npm run dev:seed-user`, `npm run access:grant` in `CORE__BACKEND/package.json`) |
| Recording | **Credentials must never be written into this document, the repository, tickets or e-mail.** They are delivered through the owner's approved secret channel and rotated or destroyed at close-out |
| Tenants | At least two separate tenants (A and B) to test isolation, each with fictional data |
| Roles | At least: tenant administrator; a user with only approval rights; a user with read-only scope on one project, location and store; a suspended user; a user with a passkey; a user with `must_change_password` set |
| Password reset | Non-production must not use a production mailbox. Whether the fixed sample code is enabled (`SAMPLE_OTP_CODE`) must be stated before testing, because production refuses it |
| Privileged accounts | No production administrator accounts are shared with testers |
| Clean-up | Test accounts are suspended at close-out; audit entries remain by design (append-only) |

## 17. Test types and methods

| Test type | Description | Standards used as guidance |
|---|---|---|
| Reconnaissance and mapping | Compare observed routes with `openapi-v1.json`; find undocumented routes and methods | OWASP WSTG |
| Authentication testing | Credential stuffing within agreed limits, lockout, enumeration, token tampering and expiry, refresh rotation and replay, passkey flows, step-up bypass | OWASP ASVS V2, V3 |
| Authorisation testing | Vertical and horizontal privilege escalation, IDOR on every `{id}` route, scope bypass, mass assignment | OWASP API Security Top 10 |
| Input validation | Injection (SQL, JSON, header, log), type confusion, oversized and malformed bodies | OWASP ASVS V5 |
| Business logic | Approval flow bypass, self-approval, level skipping, amount manipulation, replay of idempotency keys, publish-state abuse | OWASP WSTG business logic |
| File handling | Content-type spoofing, polyglot files, oversize, path or name tricks, stored content served back safely | OWASP ASVS V12 |
| Integration endpoints | Forged and replayed inbound events, out-of-order sequence, dead-letter and replay abuse, audit external forging | Custom cases |
| Tenant isolation | See section 18 | Custom cases |
| Transport and configuration | TLS configuration, headers, CORS, proxy-header spoofing for rate limits, error disclosure | OWASP WSTG config |
| Front-end testing | DOM and stored XSS, token handling, client-side authorisation reliance, dependency exposure | OWASP ASVS V14 |
| Dependency and supply chain review | Known vulnerabilities in packages listed in DOC-13 and the lockfile | OWASP SCA |
| Configuration review (optional, agreed) | Review of environment variable handling, DB role and grants (`scripts/admin/create-core-app-role.sql`, `grant-core-app-tables.sql`) | CIS-style review |
| Retest | Section 21 | n/a |

## 18. Tenant isolation test cases

The repository already tests three cases (`CORE__BACKEND/tests/testing-pass/tenant-isolation.test.ts`: token for beta cannot read an acme ticket; `X-Tenant-Id` does not move a protected request; a validly signed token claiming another tenant is refused with 401). The independent test must go further.

| ID | Test case | Expected result |
|---|---|---|
| TI-01 | Use a tenant A token to GET, PATCH and DELETE each `{id}` object belonging to tenant B, across every route group in section 14.1 | 404 or 403 with no tenant B data and no difference in timing or message that confirms existence |
| TI-02 | Send `X-Tenant-Id: B` with a tenant A token on protected routes | Header ignored; tenant A context only |
| TI-03 | Forge a token with `tenantId` B signed with a wrong key; and with `alg` none or algorithm confusion | 401 |
| TI-04 | Replay a refresh token issued in tenant A against `/auth/refresh` with `X-Tenant-Id: B` | Refused |
| TI-05 | Login with a valid tenant A credential while sending tenant B header | Refused; same message as unknown login (no tenant enumeration) |
| TI-06 | Probe tenant IDs with invalid, long, SQL-like or schema-like values in `X-Tenant-Id` | Rejected by validation (`isValidTenantId`); no database error text |
| TI-07 | Run `/search` with terms known to exist only in tenant B | No results from B |
| TI-08 | Run list endpoints with filters, sort and pagination parameters crafted to cross schemas (for example schema-qualified names) | Parameters rejected or ignored |
| TI-09 | Upload a file in tenant A; request `/files/{id}/content` of that ID with a tenant B token | Refused |
| TI-10 | Send an inbound event or audit external entry with tenant A credentials containing identifiers from tenant B | Stored only in tenant A; no effect on B |
| TI-11 | Concurrent requests from tenants A and B on the same pooled connection (rapid alternation) | No context leakage; each transaction uses its own `search_path` (`SET LOCAL`) |
| TI-12 | Check shared tables (`shared` reference data, `public.core_rate_limit_window`) for data that could cross tenants or allow rate-limit interference | Only non-personal shared data; limiter keys do not expose other tenants |
| TI-13 | Check that error responses, `X-Request-Id` and logs do not reveal tenant names or schema names | No disclosure |
| TI-14 | Check that a suspended or deleted tenant user token is refused promptly | 401 |
| TI-15 | Check idempotency keys cannot be replayed across tenants to read another tenant's cached response | Keys scoped per tenant schema (`integ_idempotency_key` lives in the tenant schema) |

## 19. Rules of engagement

| Rule | Statement |
|---|---|
| Authorisation | No testing before written authorisation naming target, window, tester IP addresses and contacts |
| Target limits | Only the hosts listed in the authorisation; no scanning beyond them |
| Intensity | Rate limited to avoid service degradation; no automated brute force above agreed volume; stay within the application's own limits where testing login throttling |
| Data handling | Synthetic data only. If real personal data is encountered, stop, do not copy it, report it immediately |
| Destructive actions | No deletion of shared data, no database schema changes, no attempts to break the audit chain by direct database access unless a configuration review is agreed |
| Credentials | Handled per section 16; never in reports or e-mail |
| Evidence | Keep minimal, redacted proof; store encrypted; delete after retest sign-off or as the contract states |
| Communication | Critical or high findings with active exploit paths reported to the owner within one business day; emergency contact list is To be confirmed |
| Stop conditions | Unexpected outage, data exposure beyond scope, instruction from the owner |
| Confidentiality | Findings and the OpenAPI details remain confidential; NDA in force (To be confirmed) |
| Subcontractors | None without written consent |
| Legal | Compliance with applicable computer misuse laws; indemnity and liability terms in the contract (To be confirmed) |

## 20. Reporting format and severity scale

### 20.1 Report contents

| Section | Content |
|---|---|
| Executive summary | Scope, dates, method, overall risk, count by severity |
| Findings | One entry per finding using the template in 20.2 |
| Positive observations | Controls that worked |
| Coverage matrix | Route groups and cross-cutting items tested, with result and any limits |
| Tenant isolation results | One row per TI case |
| Appendix | Tools, tester identities, time log, retest plan |

### 20.2 Finding template

| Field | Content |
|---|---|
| ID | PT-NNN |
| Title | Short, specific |
| Severity | Critical, High, Medium, Low or Informational (scale below) |
| CVSS v3.1 or v4.0 vector and score | Calculated by the tester |
| Affected component | Route, module and file if known |
| Description | What the weakness is |
| Reproduction steps | Numbered, with sanitised requests |
| Impact | Confidentiality, integrity, availability, tenant and data effects |
| Evidence | Redacted request and response excerpts |
| Recommendation | Specific fix |
| Standards reference | OWASP, CWE |
| Status | Open, Fixed, Accepted risk, Retest passed or failed |

### 20.3 Severity scale

| Severity | Definition | Example in Core | Target fix time (proposed, To be confirmed) |
|---|---|---|---|
| Critical | Direct compromise of many tenants or the platform, or unauthenticated full access | Cross-tenant data read or write; authentication bypass; remote code execution | Fix before go-live; emergency patch within 72 hours if live |
| High | Serious impact on confidentiality or integrity of tenant data, or privilege escalation | Privilege escalation to administrator; approval bypass; forged inbound events accepted without administrator rights | 14 days |
| Medium | Limited impact or needs special conditions | Missing step-up on a sensitive action; weak lockout behaviour; stored XSS needing privileged victim | 30 days |
| Low | Minor weakness, limited exploitability | Verbose error text; missing hardening header on a non-sensitive route | 90 days |
| Informational | No direct risk; improvement advice | Observation on documentation or hygiene | Next release |

## 21. Retest policy

| Item | Policy |
|---|---|
| Fix verification | The tester retests all Critical, High and Medium findings after the owner states they are fixed; Low findings by sample |
| Window | One retest round within 60 days of the final report is included; further rounds by agreement |
| Evidence | Owner provides change reference and commit or release identifier; the repository gate (`npm run ci`, API lock test `npm run test:regression:api`) must pass before retest |
| Result | Each finding marked Retest passed, Retest failed, or Accepted risk with named approver |
| New issues | New findings discovered during retest are reported in a retest addendum |
| Closure | Final letter of assurance issued after all Critical and High findings are closed (format To be confirmed) |
| Regression guard | Every fixed finding gains an automated regression test in `CORE__BACKEND/tests` where feasible |

## 22. Pre-test readiness checklist

Tick each item before the engagement starts. Evidence column is for the owner's record.

| # | Item | Done | Evidence or owner |
|---|---|---|---|
| 1 | Written authorisation, window, tester names and source IPs agreed | | To be confirmed |
| 2 | Non-production environment built from the current release, production-like configuration (`NODE_ENV=production`, TLS, trusted proxy, HSTS) | | To be confirmed |
| 3 | `JWT_SECRET` and database credentials for the test environment are unique and not reused from production | | To be confirmed |
| 4 | Database application role created and used (`scripts/admin/create-core-app-role.sql`, `grant-core-app-tables.sql`); `npm run db:migrate` applied | | To be confirmed |
| 5 | Two or more tenants provisioned (`npm run db:provision -- <tenantId>`) with synthetic data | | To be confirmed |
| 6 | Test accounts per section 16 issued through a secure channel; none recorded in documents | | To be confirmed |
| 7 | Decision on password-reset code delivery in the test environment recorded (`SAMPLE_OTP_CODE` or provider sandbox) | | To be confirmed |
| 8 | `CORS_ORIGINS`, `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGINS` set to test-environment origins | | To be confirmed |
| 9 | Latest `docs/api/openapi-v1.json` and role descriptions given to the tester | | To be confirmed |
| 10 | Full repository gate green on the build under test (`npm run ci`) | | CI run reference To be confirmed |
| 11 | Backup taken and a restore drill passed (`npm run db:backup`, `npm run db:drill`) so the environment can be reset | | `CORE__BACKEND/docs/restore-drills/` |
| 12 | Audit chain verified intact before testing (restore drill report line "Audit chain ... intact") | | To be confirmed |
| 13 | Monitoring and log access ready; emergency contacts and stop procedure shared | | To be confirmed |
| 14 | Rate limits documented for the tester; test source IPs known to the proxy configuration | | To be confirmed |
| 15 | Known issues and accepted risks listed so they are not re-reported (see [DOC-20](20-Compliance-Readiness-Matrix.md) backlog) | | To be confirmed |
| 16 | NDA and contract terms signed | | To be confirmed |
| 17 | Fix capacity reserved for findings and retest | | To be confirmed |

## 23. Open items

| # | Item | Owner |
|---|---|---|
| 1 | Document owner and approver | To be confirmed |
| 2 | Hosting vendor, e-mail/SMS/OTP vendor, event transport vendor and any certifications held | To be confirmed |
| 3 | Penetration test provider, window, budget and contract terms | To be confirmed |
| 4 | Test environment location, data set and who builds it | To be confirmed |
| 5 | Emergency contacts and approver of stop and go decisions | To be confirmed |
| 6 | Target fix times per severity (proposed values in 20.3) | To be confirmed |
| 7 | Whether the front end is in the same engagement and whether a mobile client exists | To be confirmed |
| 8 | Supplier register, review cycle and approver of Part A outcomes | To be confirmed |

## 24. Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | To be confirmed | First draft from repository review |
