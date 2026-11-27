# VeloxIQ Core

VeloxIQ Core is the shared foundation that every VeloxIQ application uses. A company (a *tenant*) sets up its company profile, projects and sites, people, master data, policies and approval rules once in Core. The other applications (HRMS, P&M, PMS, Stores and the Contractor App) read these and raise their own records against them.

This repository holds the two parts of Core:

| Folder | What it is |
|---|---|
| [`CORE__BACKEND`](CORE__BACKEND) | The Core API: Node.js 24, TypeScript, Fastify, PostgreSQL 18 (one schema per tenant). Runs on port 3200. |
| [`CORE__FRONTEND`](CORE__FRONTEND) | The Core web app: React 19, TypeScript, Vite. Runs on port 5173 and proxies `/api` to the backend. |

## What Core covers

- **Company setup:** company profile, policies (leave, overtime, shift, holiday), subscription.
- **Projects:** projects, geofences, WBS, chainage, milestones, BOQ, sub-contractors, workforce adverts, quotation approval.
- **People:** departments, organogram, users and roles, job openings, approved list, manpower availability.
- **Material management:** stores, materials, vendors, project material planning, live stock.
- **Fleet and equipment:** company and hired equipment registers, project equipment planning, available and assigned equipment, maintenance.
- **Governance:** approval matrix and approval requests, grievances, audit log, help and support.
- **Platform services:** files, notifications, integration events (outbox and inbox), idempotency, offline sync.

The full requirements, screen-by-screen flows and the data Core exchanges with the other applications are in [`CORE__BACKEND/docs/CORE_REQUIREMENTS.md`](CORE__BACKEND/docs/CORE_REQUIREMENTS.md).

## Run it locally

**You need:** Node.js 24 or newer, npm, and PostgreSQL 18.

### 1. Backend

```powershell
cd CORE__BACKEND
npm install
copy .env.example .env        # then set DATABASE_URL and the other values in .env
npm run db:migrate            # applies migrations to every tenant schema
npm run dev                   # API on http://127.0.0.1:3200
```

Create a tenant schema with `npm run db:provision -- <tenantId>`. The detailed set-up (database, roles, environment table) is in [`CORE__BACKEND/README.md`](CORE__BACKEND/README.md).

### 2. Frontend

```powershell
cd CORE__FRONTEND
npm install
copy .env.example .env.local  # set VITE_TENANT_ID to your tenant id
npm run dev                   # app on http://localhost:5173
```

Sign in with a user created in your tenant. Passwords are never stored in this repository.

## Check it

| Where | Command | What it runs |
|---|---|---|
| Backend | `npm run typecheck` | TypeScript check |
| Backend | `npm test` | Vitest (database tests need a local PostgreSQL) |
| Backend | `npm run api:snapshot` | Rewrites the locked API contract after an API change |
| Frontend | `npm run typecheck` | TypeScript check |
| Frontend | `npm test` | Vitest |
| Frontend | `npm run ci` | Typecheck, lint, tests, build and bundle check |

## API contract

The API is versioned and locked (currently 1.23.0). The contract is `CORE__BACKEND/docs/api/openapi-v1.json`, and every change is listed in [`CORE__BACKEND/docs/API_V1.md`](CORE__BACKEND/docs/API_V1.md). Additions bump the minor version; names are not changed within v1. The running API serves its spec at `/openapi.json`.

## Conventions

- One PostgreSQL database; each tenant has its own schema (`tenant_<id>`). The tenant comes from the signed-in session, never from the request body.
- Every POST and PATCH sends an `Idempotency-Key`; updates send the `rowVersion` they read.
- Other applications change Core data only through the Core API.
- Migrations live in `CORE__BACKEND/migrations`, are numbered, and are applied to every tenant schema with `npm run db:migrate`.

## More documents

- [`CORE__BACKEND/Core_Database_Handoff.md`](CORE__BACKEND/Core_Database_Handoff.md): the tables and the columns other applications point at.
- [`CORE__BACKEND/docs/DEPLOYMENT.md`](CORE__BACKEND/docs/DEPLOYMENT.md): deployment.
- [`CORE__BACKEND/docs/frontend-handoff.md`](CORE__BACKEND/docs/frontend-handoff.md): how the frontend calls the API.
- [`CORE__FRONTEND/README.md`](CORE__FRONTEND/README.md): the frontend structure and rules.
