| Field | Value |
|---|---|
| Document ID | DOC-13 |
| Title | Third-Party Software and Licence Inventory |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Internal |

## 1. Purpose

This inventory lists every direct third-party package used by the VeloxIQ Core backend and frontend, with the version declared in `package.json`, the version installed at the time of writing, and the licence the package declares. It supports licence compliance review, vulnerability management and supplier risk assessment.

## 2. Scope and method

- **Direct dependencies only** (the packages named in each `package.json`). Transitive dependencies are not listed here; a full software bill of materials needs a tool (see section 6).
- Versions and licences were read from `node_modules/<package>/package.json` on 2026-11-25. A package whose licence field is empty is shown as "Not declared" and must be checked manually.
- This is a technical inventory, **not legal advice**. A licence review by the legal or compliance function is required before distribution.

## 3. Licence summary (direct dependencies, both applications)

| Licence | Packages |
|---|---|
| MIT | 58 |
| Apache-2.0 | 2 |
| OFL-1.1 | 2 |
| BSD-3-Clause | 1 |
| SEE LICENSE AT https://gsap.com/standard-license | 1 |
| Standard 'no charge' license: https://gsap.com/standard-license. | 1 |
| BSD-2-Clause | 1 |
| ISC | 1 |
| MPL-2.0 | 1 |

## 4. Backend (CORE__BACKEND): Runtime dependencies

Package `velox-core-backend` version 1.10.0; engines: {"node":">=24.0.0"}.

| Package | Declared | Installed | Licence |
|---|---|---|---|
| @simplewebauthn/server | 14.0.3 | 14.0.3 | MIT |
| express | 5.2.1 | 5.2.1 | MIT |
| hash-wasm | 4.12.0 | 4.12.0 | MIT |
| jose | 6.2.15 | 6.2.15 | MIT |
| light-my-request | 6.8.1 | 6.8.1 | BSD-3-Clause |
| pg | 8.23.1 | 8.23.1 | MIT |
| pino | 10.4.0 | 10.4.0 | MIT |
| zod | 4.6.7 | 4.6.7 | MIT |

## 5. Backend (CORE__BACKEND): Development dependencies

| Package | Declared | Installed | Licence |
|---|---|---|---|
| @eslint/js | 10.0.1 | 10.0.1 | MIT |
| @types/express | 5.0.6 | 5.0.6 | MIT |
| @types/node | 24.19.2 | 24.19.2 | MIT |
| @types/pg | 8.23.1 | 8.23.1 | MIT |
| eslint | 10.15.0 | 10.15.0 | MIT |
| eslint-config-prettier | 10.1.8 | 10.1.8 | MIT |
| prettier | 3.10.1 | 3.10.1 | MIT |
| tsx | 4.23.15 | 4.23.15 | MIT |
| typescript | 5.9.3 | 5.9.3 | Apache-2.0 |
| typescript-eslint | 8.73.0 | 8.73.0 | MIT |
| vitest | 5.1.1 | 5.1.1 | MIT |

## 6. Frontend (CORE__FRONTEND): Runtime dependencies

Package `veloxiq-core` version 1.0.0.

| Package | Declared | Installed | Licence |
|---|---|---|---|
| @fontsource-variable/inter | ^5.3.0 | 5.3.0 | OFL-1.1 |
| @fontsource-variable/plus-jakarta-sans | ^5.3.0 | 5.3.0 | OFL-1.1 |
| @formkit/auto-animate | ^0.10.0 | 0.10.0 | MIT |
| @gsap/react | ^2.1.2 | 2.1.2 | SEE LICENSE AT https://gsap.com/standard-license |
| @hookform/resolvers | ^6.0.0 | 6.0.0 | MIT |
| @radix-ui/react-dialog | ^1.3.1 | 1.3.1 | MIT |
| @radix-ui/react-dropdown-menu | ^2.2.1 | 2.2.1 | MIT |
| @radix-ui/react-popover | ^1.3.1 | 1.3.1 | MIT |
| @radix-ui/react-tooltip | ^1.4.1 | 1.4.1 | MIT |
| @simplewebauthn/browser | ^14.0.0 | 14.0.0 | MIT |
| clsx | ^2.1.1 | 2.1.1 | MIT |
| cmdk | ^1.1.1 | 1.1.1 | MIT |
| date-fns | ^4.4.0 | 4.4.0 | MIT |
| gsap | ^3.15.0 | 3.15.0 | Standard 'no charge' license: https://gsap.com/standard-license. |
| leaflet | ^1.9.4 | 1.9.4 | BSD-2-Clause |
| lucide-react | ^1.61.0 | 1.61.0 | ISC |
| react | ^19.3.1 | 19.3.1 | MIT |
| react-dom | ^19.3.1 | 19.3.1 | MIT |
| react-hook-form | ^7.90.0 | 7.90.0 | MIT |
| react-is | ^19.3.1 | 19.3.1 | MIT |
| react-router-dom | ^7.18.4 | 7.18.4 | MIT |
| recharts | ^3.10.1 | 3.10.1 | MIT |
| sonner | ^2.0.8 | 2.0.8 | MIT |
| tailwind-merge | ^3.7.0 | 3.7.0 | MIT |
| zod | ^4.6.7 | 4.6.7 | MIT |
| zustand | ^5.0.16 | 5.0.16 | MIT |

## 7. Frontend (CORE__FRONTEND): Development dependencies

| Package | Declared | Installed | Licence |
|---|---|---|---|
| @eslint/js | ^10.0.1 | 10.0.1 | MIT |
| @tailwindcss/vite | ^4.3.3 | 4.3.3 | MIT |
| @testing-library/dom | ^10.4.2 | 10.4.2 | MIT |
| @testing-library/jest-dom | ^7.0.1 | 7.0.1 | MIT |
| @testing-library/react | ^16.3.3 | 16.3.3 | MIT |
| @testing-library/user-event | ^14.6.8 | 14.6.8 | MIT |
| @types/leaflet | ^1.9.20 | 1.9.20 | MIT |
| @types/node | ^26.6.5 | 26.6.5 | MIT |
| @types/react | ^19.3.0 | 19.3.0 | MIT |
| @types/react-dom | ^19.3.0 | 19.3.0 | MIT |
| @vitejs/plugin-react | ^6.1.2 | 6.1.2 | MIT |
| axe-core | 4.10.3 | 4.10.3 | MPL-2.0 |
| dependency-cruiser | ^18.7.2 | 18.7.2 | MIT |
| eslint | ^10.13.0 | 10.15.0 | MIT |
| eslint-plugin-react-hooks | ^7.1.1 | 7.1.1 | MIT |
| eslint-plugin-react-refresh | ^0.5.7 | 0.5.7 | MIT |
| globals | ^17.13.0 | 17.13.0 | MIT |
| jsdom | ^29.1.1 | 29.1.1 | MIT |
| tailwindcss | ^4.3.3 | 4.3.3 | MIT |
| typescript | ^6.0.3 | 6.0.3 | Apache-2.0 |
| typescript-eslint | ^8.72.0 | 8.73.0 | MIT |
| vite | ^8.3.5 | 8.3.5 | MIT |
| vitest | ^5.0.5 | 5.0.5 | MIT |

## 8. Controls and gaps

| Topic | Status |
|---|---|
| Lock file (reproducible installs) | Backend: present; Frontend: present |
| Automated vulnerability scanning in CI | Not found in the repository (`npm run ci` runs typecheck, lint, tests and build only) |
| Software bill of materials (SBOM) export | Not found; recommended: generate a CycloneDX SBOM per release (for example `npx @cyclonedx/cyclonedx-npm`) |
| Dependency update policy | To be confirmed |
| Approved-licence policy | To be confirmed by legal or compliance |

### Licences that need a decision

| Package | Licence | Why it needs review |
|---|---|---|
| `gsap`, `@gsap/react` (frontend, runtime) | GreenSock standard "no charge" licence (not an open-source licence) | Free for most uses but has conditions; legal must confirm it fits how VeloxIQ is sold or distributed. The animation library could be replaced if it does not. |
| `axe-core` (frontend, development only) | MPL-2.0 | Weak copyleft. Used only for accessibility testing, so it is not shipped to users. Record that decision. |
| `@fontsource-variable/inter`, `@fontsource-variable/plus-jakarta-sans` (frontend, runtime) | SIL Open Font Licence 1.1 | Permits bundling and use; fonts may not be sold on their own and the licence text must travel with them. |
| `typescript` (both, development only) | Apache-2.0 | Permissive; notice file required if redistributed. Not shipped. |

## 9. Open items

1. Confirm the approved and prohibited licence list with legal or compliance, then review any "Not declared" or copyleft entries above.
2. Add dependency vulnerability scanning (for example `npm audit` or an equivalent) to the CI script.
3. Produce an SBOM at each release and store it with the release record (see DOC-11).
4. Name an owner for dependency updates.

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | Engineering | First issue, generated from the package files |
