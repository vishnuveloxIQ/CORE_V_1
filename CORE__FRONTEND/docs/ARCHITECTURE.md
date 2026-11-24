# Architecture: Modular Monolith

VeloxIQ Core is one deployable React app, split into **feature modules** with explicit public APIs.
The rules below are enforced by ESLint (`npm run lint`) and dependency-cruiser (`npm run deps`).

## Layout

```
src/
  main.tsx            entry: mounts <App/>, loads global CSS
  app/                composition root (no business logic)
    App.tsx           providers, auth gate, router, Shell
    routes.ts         ROUTES = every module's routes, in menu order
    ErrorBoundary.tsx
    pages/NotFound.tsx
    styles/           global CSS (index.css imports the rest)
  modules/<name>/
    index.ts          PUBLIC API: the only file other modules may import
    routes.ts         the module's lazy-loaded routes (imported only by app)
    pages/ components/ hooks/ store/ types/ utils/ data/ config/
  shared/             generic, feature-agnostic building blocks
    ui/  lib/  hooks/  types/  assets/
  test/               app-level tests (exempt from boundary rules)
```

Standard subfolders exist only where a module has files for them. Empty folders were not created.

## Modules

| Module | Owns |
|---|---|
| `core-data` | seed data, the `useCore` store, shared domain types, scope and tone helpers. Most modules depend on it |
| `shell` | layout (Sidebar, Header, Dock, Footer, CommandPalette, PageHead), theme, `APP` and `NAV` config |
| `auth` | the sign-in page and the `useAuth` store |
| `dashboard` | the home dashboard |
| `approvals` | approval requests, chains, job openings, approval matrix |
| `grievances` | grievances and site visits |
| `company` | company profile, policies, offer letters |
| `organisation` | departments, roles, users |
| `projects` | projects, sites, geo-fencing |
| `resources` | stores and the equipment register |
| `audit` | audit log |
| `support` | help and style guide |

## Dependency Rules

1. **Modules talk only through `index.ts`.** Write `import { useCore } from '@/modules/core-data'`, never `@/modules/core-data/store/...`. Inside a module, use relative imports.
2. **`shared` is a leaf.** It never imports from `modules/` or `app/`.
3. **Modules never import `app/`.**
4. **`app` composes.** It imports module barrels plus each module's `routes.ts`, and holds no business logic.
5. **No circular imports.**

Allowed direction: `app → modules → shared`, and `module → other module (index.ts)`.

| Rule | ESLint (`no-restricted-imports`) | dependency-cruiser |
|---|---|---|
| Public API only | blocks `@/modules/*/**` in modules; app may also import `@/modules/*/routes` | `module-public-api-only`, `app-uses-public-api` (also catches relative `../../other/` paths) |
| shared is a leaf | blocks `@/modules`, `@/app` in `src/shared` | `shared-is-leaf` |
| modules ↛ app | blocks `@/app` in modules | `modules-not-app` |
| no cycles | — | `no-circular` |

## Routing

- Each module's `routes.ts` exports `AppRoute[]` arrays, and every page uses `lazy(() => import('./pages/X'))`, so each page is its own chunk.
- `app/routes.ts` concatenates them in the original order. The sidebar menu and page order are unchanged.
- **`auth`** exports a lazy `Login` component from `routes.ts` instead of a route array, because the sign-in screen is rendered by the auth gate in `App.tsx`, outside the router.

## Notes and Decisions

- **`APP` lives in `shell/config/app.ts`**, not `shared/config`, because it reads `TENANT_ADMIN` from `core-data`, and `shared` may not depend on modules.
- `lib/core.ts` was split. Generic helpers went to `shared/lib/core.ts`; domain helpers went to `core-data/utils` (`scope`, `tones`), `grievances/utils/visits.ts` and `projects/utils/km.ts`.
- Some doc comments in `shell/components` still mention `config/app.ts`. The menu now lives in `shell/config/nav.ts`. Comments were left untouched to keep the refactor purely structural.
- The only path alias is `@/` → `src/`.

## Adding a Module

1. Create `src/modules/<name>/` with `pages/`, `routes.ts` and `index.ts`.
2. Export your routes from `routes.ts`, and add them to `ROUTES` in `app/routes.ts`.
3. Export only what other modules need from `index.ts`. If nothing is needed, write `export {}`.
4. Run `npm run lint && npm run deps`.

## History

The move was made as one scripted commit, `e124f7c`. Files were moved with `git mv`, so `git log --follow` keeps per-file history. Boundaries were added in `46c4eb3`. The baseline before the restructure is `51d3250`.
