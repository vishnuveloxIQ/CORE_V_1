# Modular Monolith: Phase 1 Analysis and Phase 2 Proposal

Status: **waiting for approval.** No source files have been changed.
Ground rule for Phases 3–5: this is a move, not a refactor. No renames, no logic changes, no styling changes. The only edits allowed are import paths and new `index.ts` / `routes.ts` barrel files.

---

## 1. Phase 1 findings

| Area | What exists today |
|---|---|
| Stack | React 19, TS 6, Vite 8, react-router-dom 7 (`HashRouter`), Zustand 5, Tailwind 4 + `src/styles/*.css`, zod, react-hook-form, recharts, leaflet, Vitest |
| Layout | Split by technical layer: `pages/`, `components/`, `lib/`, `store/`, `data/`, `config/`, `hooks/`, `theme/` |
| Size | 102 source files under `src/`; 48 pages in 11 page folders |
| Routing | `src/routes.tsx` holds a flat `ROUTES` array. Every page is already `lazy()` loaded |
| Aliases | Only `@/*` → `src/*` |
| Cycles | None (import graph checked file by file) |
| Git | **Not a git repository.** `git mv` is not possible yet |

### Coupling hot spots

1. **`store/useCore.ts`.** One Zustand store holds every domain: requests, grievances, projects, sites, stores, equipment, users, roles, departments, policies, chains and the audit log. Every action writes to the shared audit `log()`. It also exports helpers used across domains: `chainFor`, `chainState`, `policyState`, `nextId` and `nowISO`.
2. **`data/types.ts`** has 43 importers and **`data/seed.ts`** (602 lines) has 9. Both cover all domains.
3. **`lib/core.ts`** has 41 importers. It mixes generic helpers (`byId`, `a11y`, `uid`, `isISODate`, validators, `ACTIVE_TONE`) with domain helpers (`REQUEST_TONE`, `PROJECT_TONE`, `AVAIL_TONE`, `VISIT_TONE`, `isUpcomingVisit`, `wordCount`, `KM`, `scopeText`, `versionFields`). It imports status types from `data/types`.
4. **`config/app.ts`.** `APP` is generic. `NAV` builds its badge counts from seed `REQUESTS` and `GRIEVANCES`. `NOTIFICATIONS` deep-links into five domains.
5. **Shared-looking files that reach into domains:**
   - `components/ui/PageHead` imports `NAV` and `APP`.
   - `lib/geo` imports `LatLng`.
   - `hooks/useDocumentTheme` imports `useShell`.
6. **Imports between page folders:**
   - Dashboard imports `approvals/columns`.
   - JobOpenings imports `company/OfferLetterPanel`.
   - Login imports `ThemeSwitch` from `layout/Header`.
7. **Dead code.** `components/charts/TrendChart.tsx` has no importers.

---

## 2. Proposed modules

Eleven modules plus `app` and `shared`. Small pages are grouped so the module count stays low.

| Module | Responsibility |
|---|---|
| `core-data` | The shared domain kernel: the `useCore` store, the seed data, the domain types, and helpers that span domains (status tones, `scopeText`, `versionFields`, `pdf`) |
| `shell` | The signed-in frame: layout (Shell, Header, Sidebar, Dock, Footer, CommandPalette), `PageHead`, `useShell` UI state, `NAV`, `NOTIFICATIONS` and the document theme |
| `auth` | Sign-in page and the session store (`useAuth`) |
| `dashboard` | The landing dashboard |
| `approvals` | The request inbox and detail, approval matrix and chains, and job openings (hiring requests run through approvals) |
| `grievances` | Grievance list and detail, including visit scheduling helpers |
| `company` | Company profile, offer letter format, and HR policies |
| `organisation` | Organogram, departments, roles and users |
| `projects` | Projects and sites, including geofencing and the map |
| `resources` | Stores, materials, live stock, and equipment planning and register |
| `audit` | The audit trail screen |
| `support` | Help and the style guide |

---

## 3. Target tree

```text
src/
  main.tsx                         (stays here: index.html points at /src/main.tsx)
  app/
    App.tsx
    routes.tsx                     composes every module's routes.ts
    ErrorBoundary.tsx
    pages/NotFound.tsx
    styles/index.css
    styles/{base,components,core,shell,variant-classic}.css
  shared/
    assets/veloxiq-logo.svg
    config/app.ts                  APP only
    hooks/{useMedia.ts,useMotion.tsx}
    lib/{cn,csv,format,toast.tsx,stepUp.tsx,bulk,core}.ts   (core = generic part only)
    types/route.ts                 AppRoute interface
    ui/{Avatar,Button,Card,EmptyState,Extras,Field,Modal,StatTile,Status}.tsx
    ui/icons.tsx
    ui/data/{TablePanel,BulkUpload}.tsx
    ui/charts/{BarsCard,DonutCard,TrendChart}.tsx
    index.ts                       (optional barrel)
  modules/
    core-data/
      store/useCore.ts
      data/seed.ts
      types/index.ts               (was data/types.ts)
      utils/{tones.ts,scope.ts,pdf.ts}
      index.ts
    shell/
      components/{Shell,Header,Sidebar,Dock,Footer,CommandPalette,PageHead}.tsx
      store/useShell.ts
      hooks/useDocumentTheme.ts
      config/nav.ts                NAV + NOTIFICATIONS
      index.ts
    auth/        pages/Login.tsx  store/useAuth.ts  routes.ts  index.ts
    dashboard/   pages/Dashboard.tsx  routes.ts  index.ts
    approvals/
      pages/{ApprovalsList,ApprovalDetail,ApprovalMatrix,ChainNew,ChainEditor,JobOpenings}.tsx
      components/{columns,LevelFields}.tsx
      utils/schema.ts
      routes.ts  index.ts
    grievances/  pages/{GrievancesList,GrievanceDetail}.tsx  utils/visits.ts  routes.ts  index.ts
    company/
      pages/{CompanyProfile,Policies,PolicyEditor}.tsx
      components/{OfferLetterPanel,PolicyView,editors}.tsx
      utils/meta.ts
      routes.ts  index.ts
    organisation/
      pages/{Organogram,Departments,Roles,Users,UserDetail}.tsx
      components/{DepartmentForm,RoleForm,UserForm,ConfirmDialog}.tsx
      utils/org.ts
      routes.ts  index.ts
    projects/
      pages/{Projects,ProjectNew,ProjectDetail,Sites,SiteNew,SiteDetail}.tsx
      components/{ProjectForm,SiteForm,GeoFenceTab,GeoMap}.tsx
      utils/project/schema.ts  utils/site/schema.ts  utils/geo.ts  utils/km.ts
      routes.ts  index.ts
    resources/   pages/{Stores,Materials,LiveStock,EquipmentPlanning,EquipmentRegister}.tsx  routes.ts  index.ts
    audit/       pages/AuditTrail.tsx  routes.ts  index.ts
    support/     pages/{Help,StyleGuide}.tsx  routes.ts  index.ts
  test/
    setup.ts
    app.test.tsx                   app-level integration test, exempt from module boundaries
```

The `components/`, `hooks/`, `api/`, `store/`, `types/` and `utils/` folders are created only where a module has files for them. No empty folders.

---

## 4. File-by-file mapping

All paths are relative to `src/`. **Split** means the file's exports are cut and pasted into the listed files unchanged.

### app and entry

| Current | New |
|---|---|
| `main.tsx` | `main.tsx` (unchanged location) |
| `App.tsx` | `app/App.tsx` |
| `routes.tsx` | `app/routes.tsx` (now concatenates module route arrays) |
| `app/ErrorBoundary.tsx` | `app/ErrorBoundary.tsx` |
| `pages/NotFound.tsx` | `app/pages/NotFound.tsx` |
| `index.css` | `app/styles/index.css` |
| `styles/base.css` | `app/styles/base.css` |
| `styles/components.css` | `app/styles/components.css` |
| `styles/core.css` | `app/styles/core.css` |
| `styles/shell.css` | `app/styles/shell.css` |
| `styles/variant-classic.css` | `app/styles/variant-classic.css` |

### shared

| Current | New |
|---|---|
| `assets/veloxiq-logo.svg` | `shared/assets/veloxiq-logo.svg` |
| `config/app.ts` (`APP`) | `shared/config/app.ts` (**split**, see `shell`) |
| `hooks/useMedia.ts` | `shared/hooks/useMedia.ts` |
| `hooks/useMotion.tsx` | `shared/hooks/useMotion.tsx` |
| `lib/cn.ts` | `shared/lib/cn.ts` |
| `lib/csv.ts` | `shared/lib/csv.ts` |
| `lib/format.ts` | `shared/lib/format.ts` |
| `lib/toast.tsx` | `shared/lib/toast.tsx` |
| `lib/stepUp.tsx` | `shared/lib/stepUp.tsx` |
| `lib/bulk.ts` | `shared/lib/bulk.ts` |
| `lib/core.ts` (generic part) | `shared/lib/core.ts` (**split**: `byId`, `a11y`, `uid`, `isISODate`, `req`, `phone`, `email`, `pin`, `code`, `num`, `ACTIVE_TONE`) |
| `theme/icons.tsx` | `shared/ui/icons.tsx` |
| `components/ui/Avatar.tsx` | `shared/ui/Avatar.tsx` |
| `components/ui/Button.tsx` | `shared/ui/Button.tsx` |
| `components/ui/Card.tsx` | `shared/ui/Card.tsx` |
| `components/ui/EmptyState.tsx` | `shared/ui/EmptyState.tsx` |
| `components/ui/Extras.tsx` | `shared/ui/Extras.tsx` |
| `components/ui/Field.tsx` | `shared/ui/Field.tsx` |
| `components/ui/Modal.tsx` | `shared/ui/Modal.tsx` |
| `components/ui/StatTile.tsx` | `shared/ui/StatTile.tsx` |
| `components/ui/Status.tsx` | `shared/ui/Status.tsx` |
| `components/data/TablePanel.tsx` | `shared/ui/data/TablePanel.tsx` |
| `components/data/BulkUpload.tsx` | `shared/ui/data/BulkUpload.tsx` |
| `components/charts/BarsCard.tsx` | `shared/ui/charts/BarsCard.tsx` |
| `components/charts/DonutCard.tsx` | `shared/ui/charts/DonutCard.tsx` |
| `components/charts/TrendChart.tsx` | `shared/ui/charts/TrendChart.tsx` (unused, see decision D6) |
| (new) | `shared/types/route.ts` (the `AppRoute` interface, cut from `routes.tsx`) |

### modules

| Current | New |
|---|---|
| `store/useCore.ts` | `modules/core-data/store/useCore.ts` |
| `data/seed.ts` | `modules/core-data/data/seed.ts` |
| `data/types.ts` | `modules/core-data/types/index.ts` |
| `lib/pdf.ts` | `modules/core-data/utils/pdf.ts` (only seed uses it) |
| `lib/core.ts` (`REQUEST_TONE`, `PROJECT_TONE`, `AVAIL_TONE`) | `modules/core-data/utils/tones.ts` (**split**) |
| `lib/core.ts` (`scopeText`, `versionFields`) | `modules/core-data/utils/scope.ts` (**split**) |
| `components/layout/Shell.tsx` | `modules/shell/components/Shell.tsx` |
| `components/layout/Header.tsx` | `modules/shell/components/Header.tsx` |
| `components/layout/Sidebar.tsx` | `modules/shell/components/Sidebar.tsx` |
| `components/layout/Dock.tsx` | `modules/shell/components/Dock.tsx` |
| `components/layout/Footer.tsx` | `modules/shell/components/Footer.tsx` |
| `components/layout/CommandPalette.tsx` | `modules/shell/components/CommandPalette.tsx` |
| `components/ui/PageHead.tsx` | `modules/shell/components/PageHead.tsx` |
| `store/useShell.ts` | `modules/shell/store/useShell.ts` |
| `hooks/useDocumentTheme.ts` | `modules/shell/hooks/useDocumentTheme.ts` |
| `config/app.ts` (`NAV`, `NOTIFICATIONS`) | `modules/shell/config/nav.ts` (**split**) |
| `pages/Login.tsx` | `modules/auth/pages/Login.tsx` |
| `store/useAuth.ts` | `modules/auth/store/useAuth.ts` |
| `pages/Dashboard.tsx` | `modules/dashboard/pages/Dashboard.tsx` |
| `pages/approvals/ApprovalsList.tsx` | `modules/approvals/pages/ApprovalsList.tsx` |
| `pages/approvals/ApprovalDetail.tsx` | `modules/approvals/pages/ApprovalDetail.tsx` |
| `pages/approvals/columns.tsx` | `modules/approvals/components/columns.tsx` |
| `pages/matrix/ApprovalMatrix.tsx` | `modules/approvals/pages/ApprovalMatrix.tsx` |
| `pages/matrix/ChainNew.tsx` | `modules/approvals/pages/ChainNew.tsx` |
| `pages/matrix/ChainEditor.tsx` | `modules/approvals/pages/ChainEditor.tsx` |
| `pages/matrix/LevelFields.tsx` | `modules/approvals/components/LevelFields.tsx` |
| `pages/matrix/schema.ts` | `modules/approvals/utils/schema.ts` |
| `pages/hiring/JobOpenings.tsx` | `modules/approvals/pages/JobOpenings.tsx` |
| `pages/grievances/GrievancesList.tsx` | `modules/grievances/pages/GrievancesList.tsx` |
| `pages/grievances/GrievanceDetail.tsx` | `modules/grievances/pages/GrievanceDetail.tsx` |
| `lib/core.ts` (`VISIT_TONE`, `isUpcomingVisit`, `wordCount`) | `modules/grievances/utils/visits.ts` (**split**) |
| `pages/company/CompanyProfile.tsx` | `modules/company/pages/CompanyProfile.tsx` |
| `pages/company/OfferLetterPanel.tsx` | `modules/company/components/OfferLetterPanel.tsx` |
| `pages/policies/Policies.tsx` | `modules/company/pages/Policies.tsx` |
| `pages/policies/PolicyEditor.tsx` | `modules/company/pages/PolicyEditor.tsx` |
| `pages/policies/PolicyView.tsx` | `modules/company/components/PolicyView.tsx` |
| `pages/policies/editors.tsx` | `modules/company/components/editors.tsx` |
| `pages/policies/meta.ts` | `modules/company/utils/meta.ts` |
| `pages/organisation/Organogram.tsx` | `modules/organisation/pages/Organogram.tsx` |
| `pages/organisation/Departments.tsx` | `modules/organisation/pages/Departments.tsx` |
| `pages/organisation/Roles.tsx` | `modules/organisation/pages/Roles.tsx` |
| `pages/organisation/DepartmentForm.tsx` | `modules/organisation/components/DepartmentForm.tsx` |
| `pages/organisation/RoleForm.tsx` | `modules/organisation/components/RoleForm.tsx` |
| `pages/organisation/org.ts` | `modules/organisation/utils/org.ts` |
| `pages/users/Users.tsx` | `modules/organisation/pages/Users.tsx` |
| `pages/users/UserDetail.tsx` | `modules/organisation/pages/UserDetail.tsx` |
| `pages/users/UserForm.tsx` | `modules/organisation/components/UserForm.tsx` |
| `pages/users/ConfirmDialog.tsx` | `modules/organisation/components/ConfirmDialog.tsx` |
| `pages/projects/Projects.tsx` | `modules/projects/pages/Projects.tsx` |
| `pages/projects/ProjectNew.tsx` | `modules/projects/pages/ProjectNew.tsx` |
| `pages/projects/ProjectDetail.tsx` | `modules/projects/pages/ProjectDetail.tsx` |
| `pages/projects/ProjectForm.tsx` | `modules/projects/components/ProjectForm.tsx` |
| `pages/projects/schema.ts` | `modules/projects/utils/project/schema.ts` |
| `pages/sites/Sites.tsx` | `modules/projects/pages/Sites.tsx` |
| `pages/sites/SiteNew.tsx` | `modules/projects/pages/SiteNew.tsx` |
| `pages/sites/SiteDetail.tsx` | `modules/projects/pages/SiteDetail.tsx` |
| `pages/sites/SiteForm.tsx` | `modules/projects/components/SiteForm.tsx` |
| `pages/sites/GeoFenceTab.tsx` | `modules/projects/components/GeoFenceTab.tsx` |
| `pages/sites/schema.ts` | `modules/projects/utils/site/schema.ts` |
| `components/map/GeoMap.tsx` | `modules/projects/components/GeoMap.tsx` |
| `lib/geo.ts` | `modules/projects/utils/geo.ts` |
| `lib/core.ts` (`KM`) | `modules/projects/utils/km.ts` (**split**) |
| `pages/stores/Stores.tsx` | `modules/resources/pages/Stores.tsx` |
| `pages/stores/Materials.tsx` | `modules/resources/pages/Materials.tsx` |
| `pages/stores/LiveStock.tsx` | `modules/resources/pages/LiveStock.tsx` |
| `pages/equipment/EquipmentPlanning.tsx` | `modules/resources/pages/EquipmentPlanning.tsx` |
| `pages/equipment/EquipmentRegister.tsx` | `modules/resources/pages/EquipmentRegister.tsx` |
| `pages/AuditTrail.tsx` | `modules/audit/pages/AuditTrail.tsx` |
| `pages/Help.tsx` | `modules/support/pages/Help.tsx` |
| `pages/StyleGuide.tsx` | `modules/support/pages/StyleGuide.tsx` |
| `test/setup.ts` | `test/setup.ts` |
| `test/app.test.tsx` | `test/app.test.tsx` (imports rewritten to module `index.ts` files) |

Each module also gets a new `index.ts` (its public API) and a `routes.ts` that holds its slice of today's `ROUTES` array, with the same paths, `sample` values and lazy imports.

---

## 5. Cross-module dependencies and how each is handled

| From → To | What is used | How it is handled |
|---|---|---|
| every domain module → `core-data` | `useCore`, `nextId`, `nowISO`, `chainFor`, `chainState`, `policyState`, types, tones, `scopeText`, `versionFields`, seed constants (`ADMIN_APPROVER`, `EQUIPMENT_TYPES`, `PRIVILEGES`) | Re-exported from `core-data/index.ts`. Only one-way: `core-data` imports nothing from other modules |
| every page → `shell` | `PageHead` | Exported from `shell/index.ts` |
| `dashboard` → `approvals` | request table columns (`columns.tsx`) | Exported from `approvals/index.ts` |
| `approvals` (JobOpenings) → `company` | `OfferLetterPanel` | Exported from `company/index.ts` |
| `auth` (Login) → `shell` | `ThemeSwitch` (lives in `Header.tsx`) | Exported from `shell/index.ts`; `Header.tsx` is not split |
| `shell` (Header) → `auth` | `useAuth` (user menu, sign-out) | Exported from `auth/index.ts`. `auth/index.ts` does **not** re-export `Login` statically (the route loads it lazily), so there is no file-level cycle |
| `shell` (`NAV` badges) → `core-data` | seed `REQUESTS`, `GRIEVANCES` | Through `core-data/index.ts` |
| `shell` (`NOTIFICATIONS`) → domains | URL strings only | No import needed; links are plain paths |
| `approvals`, `organisation` → `core-data` | `scopeText` | Lives in `core-data/utils/scope.ts` |
| `approvals`, `resources` → `core-data` | `AVAIL_TONE` | Lives in `core-data/utils/tones.ts`, so `approvals` does not depend on `resources` |
| `app` → every module | `routes.ts`, `Shell`, `useAuth`, `Login` (lazy), `useDocumentTheme` | `app` imports only from module `index.ts` files |
| `shared/lib/core` → nothing domain-specific | — | After the split, its remaining exports need no `data/types` import |
| `test/app.test.tsx` → several modules | `useAuth`, `roleRules`, `NOTIFICATIONS`, `chainFor`, `ROUTES` | Imports go through `index.ts` files. `roleRules` is added to `organisation/index.ts`. Tests are excluded from the boundary lint rule |

**Module dependency graph:**
`app → {all modules}` · `{domain modules} → core-data, shell, shared` · `shell ↔ auth` (see D3) · `dashboard → approvals` · `approvals → company` · `shared → nothing`

---

## 6. Phases 3–5 plan (after approval)

1. **Baseline.**
   - `git init` and a first commit (D1).
   - Record the green state of `npm run typecheck`, `lint`, `test` and `build`.
2. **Aliases.** Keep `@/*`. Optionally add `@app/*`, `@shared/*` and `@modules/*` (D5).
3. **Move in steps, one commit each, running typecheck and test after every step:**
   1. `shared`
   2. `core-data` (including the `lib/core` split)
   3. `shell` and the `config/app` split
   4. `auth`
   5. one domain module at a time
   6. `app`
4. **Routes.**
   - Each module's `routes.ts` exports its `AppRoute[]`.
   - `app/routes.tsx` concatenates them.
   - Pages are already lazy, so lazy loading does not change.
5. **Boundaries.**
   - Add an `eslint-plugin-boundaries` or `no-restricted-imports` rule: no deep imports into `@/modules/*/…`, and `shared` may not import `app` or `modules`.
   - Add a dependency-cruiser config with no cycles and the same layer rules.
6. **Docs.** Add `docs/ARCHITECTURE.md` describing modules, public APIs and rules.
7. **Verify.**
   - Run typecheck, lint, test and build.
   - Do a manual pass of every route in the browser.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| One store for all domains breaks "each module owns its state" | Accepted as a known exception and isolated in `core-data`. Splitting into per-module Zustand slices is a later, separate change because it touches logic (D2) |
| The `ROUTES` array order changes because routes are grouped by module (for example, matrix moves next to approvals and users next to organisation) | React Router ranks routes by specificity, not array order, and the smoke test checks each route on its own. Command palette and sidebar order come from `NAV`, not `ROUTES`, so nothing visible changes |
| The import order of CSS could change if `index.css` moves | `main.tsx` keeps importing it in the same place; only the path changes |
| Barrel files (`index.ts`) can create import cycles or pull extra code into chunks | Barrels export only what is used outside the module. Pages are referenced only from `routes.ts` through dynamic `import()`, so code splitting stays as it is. dependency-cruiser runs in CI |
| `react-refresh/only-export-components` warnings in barrels | Barrels are `.ts` files that only re-export; the rule allows that |
| No git history means a bad move is hard to undo | D1 |

---

## 8. Decisions needed from you

| # | Decision | Recommendation |
|---|---|---|
| **D1** | The folder is not a git repo, so `git mv` cannot keep history | Run `git init` and commit the current state as a baseline before any move |
| **D2** | Where the single `useCore` store lives | **A:** a `modules/core-data` kernel module (recommended, no logic changes). B: slices per module, composed into one store (later phase). C: separate stores plus an audit service (changes behaviour, not recommended now) |
| **D3** | `PageHead` needs `NAV`, and `Login` needs `ThemeSwitch` | Put the whole frame in a `shell` module (recommended; no code changes, but `shell` and `auth` depend on each other's public API). The alternative is passing `NAV` to `PageHead` through context, which is a code change |
| **D4** | Grouping | `hiring` inside `approvals`; `policies` inside `company`; `users` inside `organisation`; `sites` inside `projects`; `stores` and `equipment` merged as `resources`; `Help` and `StyleGuide` as `support`. Say if you want any of these as separate modules |
| **D5** | Extra path aliases | Keep `@/` only (fewest changes). Adding `@shared`, `@modules` and `@app` is cosmetic |
| **D6** | `TrendChart.tsx` is unused | Move it to `shared/ui/charts` unchanged. Deleting it is a separate cleanup |
| **D7** | `main.tsx` location | Keep it at `src/main.tsx` so `index.html` does not change |
