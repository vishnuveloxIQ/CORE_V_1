# VeloxIQ Core release notes: draft (CORE-30-03), 2026-11-22

**Status: not released. The release decision is "no-go" until the gates at the end of this page clear.** This is the release candidate as it stands; the CORE-30 deploy and smoke tasks run only once the gates clear.

- **Backend:** API **1.6.0** (277 operations, locked v1 contract), Express 5, PostgreSQL 18.
- **Frontend:** React 19 + TypeScript (Vite).

## What is in this release

- **Identity:**
  - Password sign-in (Argon2id), with passkeys as an option.
  - One active session per user; device sign-out; passkey step-up for sensitive changes.
  - Password reset (sample code outside production until an email provider is chosen).
  - The company is chosen by the login ID prefix.
- **Company setup:**
  - Company profile, with the GSTIN pre-filled from the PAN and local checks on GSTIN, CIN and TAN.
  - The six built-in policies with versions and comparison; custom policies with deletion.
- **Projects:** projects with a fixed project ID, locations (with GPS and chainage), WBS (with status), Bill of Quantities, milestones and geo-fences.
- **Organisation:** departments, organogram, and users with their projects, locations and modules.
- **Inventory and equipment:**
  - Stores, materials, vendors, live stock and available materials.
  - The equipment register with assignments, maintenance schedules, and equipment planning.
- **Approvals:**
  - Chains of 1 to 4 levels, with versions that end when a newer one starts.
  - Requests carry a needed-by date unless they are emergencies.
  - Only the current approver can decide; decisions are confirmed first.
  - Reminders are sent at each interval, and nothing is escalated.
- **Governance:** audit trail with a sign-in history tab, event monitor with replay, read models, and record search.
- **Resilience:** request IDs with error references, a 30-second timeout, one save at a time, and an outage banner.

## Known limitations

| Limitation | Why | Owner action |
|---|---|---|
| Outbound events wait in the outbox; nothing is sent to other modules | Event transport not chosen (D13); retry values open (D14) | Choose the transport and the retry values |
| Read models fill only through `POST /integration-events/inbound`; no stale verdict | Module payloads (D15) and the freshness threshold (D16) are open | Supply the fixtures; set the threshold |
| Subscription page uses sample plans | Plan tiers and Stores mapping open (D17) | Decide the tiers |
| Resource and material planning use sample data | No planning API yet | Plan the API |
| Password reset sends no email | No email provider (D10) | Choose a provider before production |
| Not tested in Edge or with a screen reader | Not available in the test environment | Run the UAT scripts in Edge with NVDA |
| Performance measured locally only | No staging (B1) | Repeat the load baseline on staging |

## Release gates (all must clear before deploy)

| Gate | State |
|---|---|
| Git repository, protected branch, CI on a service (B2) | **Open** |
| AWS staging: secrets store, PostgreSQL 18 with PITR, TLS, Cloudflare routing (B1) | **Open** |
| `core_app` database role and least-privilege grants (B3) | **Open** |
| Regression on staging (regression 3) and UAT sign-off by the owner | **Open:** needs staging and stakeholders |
| Release authorisation: production credentials, change window, go/no-go signer | **Open** |
| Automated suites green (backend 742, frontend 212), 0 known vulnerabilities, restore drill clean | **Met** (2026-11-22, `evidence/regression-2-2026-11-22`) |

## Rollback

- **Code:** redeploy the previous build.
- **Schema:** forward-only; restore from the backup taken before the release (`npm run db:restore`, see `CORE__BACKEND/docs/DEPLOYMENT.md`). Tenant data is never deleted to roll back.

## Build and environment

- **Frontend:** `npm ci`, `npm run build`. Variables: `VITE_API_BASE_URL`, `VITE_API_PROXY_TARGET` (dev only), `VITE_SAMPLE_OTP_CODE` (test builds only).
- **Backend:** `npm ci`, `npm run build`, `npm run db:migrate`, `npm start`. Variables are listed in `CORE__BACKEND/.env.example` (names only; values come from the secrets store).
