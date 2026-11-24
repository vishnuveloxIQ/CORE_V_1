# VeloxIQ CORE Design System

The complete layout and component specification for VeloxIQ CORE. Other VeloxIQ applications and modules should follow this document so that every product looks, behaves and reads the same.

This document extends [DESIGN.md](DESIGN.md) (the short token summary). Where the two differ, the source code listed in section 12 is the final authority.

Screenshots: [layout anatomy](screens/layout-anatomy.png), [dashboard light](screens/dashboard-light.png), [dashboard dark](screens/dashboard-dark.png), [phone dashboard](screens/phone-dashboard.png), [phone list](screens/phone-list.png).

---

## 1. Purpose and adoption

**Goal:** one visual language across all VeloxIQ applications. A user who knows CORE should recognise any other module immediately.

**Stack the design is built on**

| Concern | Choice |
|---|---|
| UI | React 19, TypeScript, Vite |
| Styling | Hand-written CSS driven by CSS variables. Tailwind v4 is used only to expose the same variables as utilities (`@theme inline`). |
| State | Zustand |
| Forms | react-hook-form with zod |
| Primitives | Radix UI (Dialog and similar) |
| Icons | Lucide, mapped by semantic name |
| Fonts | Inter Variable (body), Plus Jakarta Sans Variable (headings), self-hosted via `@fontsource-variable` |

**How another application adopts the design**

1. Copy the three theme files from `src/app/styles/`: `index.css`, `base.css`, `variant-classic.css`, plus the component stylesheets `components.css`, `core.css` and `shell.css`.
2. Set `data-variant="classic"` on `<html>`. Add the class `dark` for dark mode.
3. Copy `src/shared/ui/` (Button, Card, StatTile, Status, Modal, EmptyState, Avatar, Field, Extras, TablePanel, icons) and `src/shared/lib/format.ts`.
4. Reuse the shell in `src/modules/shell/` (Header, Sidebar, Footer, Dock, Command palette) and supply your own navigation config (section 5).
5. Follow the checklist in section 11.

Do not create new colours, radii, fonts or shadows in a module. Add them to the shared tokens first.

---

## 2. Design principles

1. **Table-first.** Business data is shown in searchable, sortable tables. Cards and charts support the table; they do not replace it.
2. **Flat and calm.** White surfaces, thin borders, soft shadows. Colour is reserved for meaning (status, the single primary action).
3. **One primary action per screen.**
4. **Consistent wording.** Plain, professional, sentence-case copy (section 8).
5. **Accessible by default.** Visible focus, keyboard access, labelled controls, reduced-motion support.
6. **Responsive.** Desktop first; tables become cards and the sidebar becomes a drawer on phones.
7. **Light and dark parity.** Every colour is a token with a value for both themes.

---

## 3. Design tokens

The theme is called **Classic**: navy and rose, flat surfaces. Tokens are set on `html[data-variant="classic"]` (light) and `html.dark[data-variant="classic"]` (dark).

### 3.1 Brand colours

| Token | Value | Use |
|---|---|---|
| `--navy` | `#062258` | Brand, active navigation, headings accent |
| `--blue` | `#123C94` | Primary actions, links |
| `--blue-2` | `#4F7BE8` | Focus ring, highlights |
| `--rose` | `#DE9C90` | Secondary accent, active icon |
| `--rose-d` | `#C27D70` | Accent text and lines |

### 3.2 Surfaces, text and borders

| Token | Light | Dark |
|---|---|---|
| `--page` / `--canvas` | `#F2F4FA` | `#070D1F` |
| `--card` / `--card-solid` | `#FFFFFF` | `#0F1830` |
| `--card-2` | `#F7F8FC` | `#131E3D` |
| `--field` | `#FFFFFF` | `#131E3D` |
| `--ink` (primary text) | `#0C1A3D` | `#EDF0FA` |
| `--ink-2` (secondary text) | `#37446A` | `#C5CDE6` |
| `--muted` | `#68738F` | `#93A0C6` |
| `--line` (border) | `#E3E7F1` | `#22305A` |
| `--line-2` (soft border) | `#ECEFF7` | `#1A2750` |
| `--chrome` (header and footer) | `#FFFFFF` | `#FFFFFF` |

Chrome helpers: `--chrome-line #E3E8F3`, `--chrome-ink #0B2452`, `--chrome-muted #66719A`, `--chrome-field #F1F4FB`, `--chrome-hover #E5EAF7`.

### 3.3 Status colours

Each status has a text colour and a matching tint background (`--green-bg` and so on).

| Meaning | Token | Light text | Light background | Dark text |
|---|---|---|---|---|
| Success | `--green` | `#12775A` | `#E2F5EC` | `#58D6A2` |
| Warning | `--amber` | `#8F5B0E` | `#FFF1D3` | `#F0C06A` |
| Danger | `--red` | `#B03535` | `#FCE8E8` | `#F08E8B` |
| Information | `--sky` | `#2A56BE` | `#E6EDFD` | `#8EAEFA` |
| Neutral | `--slate` | `#5B6685` | `#EDF0F6` | `#A5B0CF` |

### 3.4 Chart colours

`--c-green #1FA97A`, `--c-amber #E5A23A`, `--c-blue #4F7BE8`, `--c-red #D9625F`. Series colours: `--chart-1` (`#123C94` light, `#8EAEFA` dark) and `--chart-2` (`#C27D70` light, `#DE9C90` dark).

### 3.5 Gradients and effects

| Token | Value |
|---|---|
| `--grad` | `135deg, #123C94 → #062258` (dark: `#17306F → #0B1A44`) |
| `--accent-line` | `90deg, #062258 → #C27D70 → transparent` |
| Primary button (dark) | Rose gradient `#CF8477 → #A9594D` |
| `--shadow`, `--shadow-lg`, `--glow` | Defined per theme; use these, never custom shadows |

### 3.6 Shape

| Element | Radius |
|---|---|
| Card (`--r`) | 18px |
| Small surfaces (`--r-sm`) | 12px |
| Buttons (`--btn-r`) | 12px |
| Stat tile | 16px |
| Hero | 20px |
| Modal | 22px |
| Command palette | 20px |
| Popover | 16px |
| Info box | 14px |
| Chip | 10px |
| Status badge, cell pill | 8px |
| Segmented tabs | 12px (inner buttons 9px) |
| Pills | 99px |

### 3.7 Typography

| Role | Font | Notes |
|---|---|---|
| Body | Inter Variable | 14px, line-height 1.55 |
| Headings, card titles, page titles | Plus Jakarta Sans Variable | Weight 650 to 800 |
| Buttons | Inter | Weight 650 |

### 3.8 Base behaviour

- **Focus ring:** `:focus-visible` shows a 2.5px solid `--blue-2` outline with a 2px offset. Never remove it.
- **Skip link** (`.skip`) jumps to `#main`. `.sr-only` hides text visually but keeps it for screen readers.
- `[hidden]` is always honoured.
- `prefers-reduced-motion` disables animation and count-up effects.
- **Icons:** `svg.i` is 22px; the outline variant `.o` uses a 1.9 stroke.

### 3.9 Breakpoints

| Width | Effect |
|---|---|
| 1380px | Dashboard grid reduces columns |
| 1100px | Header compacts |
| 899px | Sidebar becomes a drawer, tables become cards |
| 820px | Layout tightens |
| 700 / 640 / 600px | Phone spacing |
| 520px | Small phone adjustments |
| 380px (`xs`) | Smallest phones |
| Print | Chrome hidden, content only |

---

## 4. App shell and layout

Root wrapper: `.shell-classic` (`src/modules/shell/components/Shell.tsx`).

```
┌──────────────────────────────────────────────────────────┐
│ Header (fixed, 60px)                                     │
├──────────┬───────────────────────────────────────────────┤
│ Sidebar  │ .main  (padding 26px 30px 0)                  │
│ fixed    │   .content (max-width 1440px)                 │
│ 268px    │     PageHead                                  │
│ (78px    │     Stat tiles (optional)                     │
│ collapsed│     Cards / TablePanel                        │
│ )        │   Footer (min-height 52px, gradient top line) │
└──────────┴───────────────────────────────────────────────┘
        Dock (bottom bar, phones only)   Command palette (Ctrl/Cmd+K)
```

### 4.1 Header

Height `--hh` 60px, fixed, uses the chrome colours. Left to right:

1. **Brand logo** link (162 × 60 SVG).
2. **Command search** (`.cmd`, flexible up to 420px). Opens the command palette.
3. **Theme switch** (sun and moon).
4. **Notifications** popover.
5. **Role chip** and **profile menu**.

The header is identical on every screen, including login and registration.

### 4.2 Sidebar

- Width `--sbw` 268px; collapsed 78px (`html[data-sidebar="collapsed"]`). The state is saved in local storage.
- **Nav item:** 44px high, radius 12px. Active item uses the navy gradient with white text and a rose icon. In dark mode it is a translucent rose tint with a ring.
- Items are grouped under small headings (section 5).

### 4.3 Content area

`.main` has `margin-left: var(--sbw)` and padding `26px 30px 0`. `.content` is centred with a maximum width of 1440px. `<main id="main" tabIndex={-1}>` is the skip-link target. Each route change scrolls to the top.

### 4.4 Footer

Full width of the content area (negative side margin `0 -30px`), minimum height 52px, with a 2px gradient line on top.

### 4.5 Phone behaviour (below 899px)

- The sidebar becomes a **drawer**: `min(216px, 62vw)`, slides in from the left, closes on route change and on Esc. State is stored as `html[data-drawer]`.
- The **Dock** appears at the bottom with the first four navigation items.
- Tables become stacked cards.
- Page padding reduces at 700, 640 and 600px.

### 4.6 Command palette

Opened with Ctrl/Cmd+K or by clicking the header search (`.cmdk`, radius 20px). Lists pages from the navigation config; arrow keys and Enter select.

---

## 5. Navigation structure

Navigation is defined once as a list of groups in `src/modules/shell/config/nav.ts`. Each item is `{ label, to, icon, badge? }`.

| Group | Items |
|---|---|
| Overview | Dashboard |
| Company setup | Company profile, Policies, Subscription |
| Projects and sites | Projects, Sites |
| People and organisation | Organogram, Departments, Users, Roles, Approvals, and others |

Rules for another module:

- Provide your own groups and items; keep the same group-heading style.
- Use icons from the shared icon map only (`src/shared/ui/icons.tsx`).
- Put the four most important items first; they form the phone Dock.
- The breadcrumb uses `APP.module` as its first label, then the parent group, then the current page.

---

## 6. Component catalogue

All components live in `src/shared/ui/` unless stated.

### 6.1 Button

| Prop | Values |
|---|---|
| `tone` | `primary`, `secondary` (default), `success`, `danger`, `white` |
| `size` | `md` (default), `sm` |
| `icon`, `iconRight` | Icon name from the shared map |

Renders `.btn <tone> [sm]`. **Do:** use one `primary` per screen; use `danger` only for destructive actions. **Don't:** place two primary buttons side by side.

### 6.2 Card

Props: `title`, `subtitle`, `action`, `noBody`, `enter`, `className`, `bodyClassName`, `style`.
Structure: `.card` → `.card-h` (`.card-t` title, `.card-s` subtitle, action) → `.card-b`. Titles pass through `headingCase`.

### 6.3 StatTile

Summary figure for a dashboard or list header.

| Prop | Meaning |
|---|---|
| `label` | Short heading (Title Case) |
| `value` | Number; counts up on load |
| `icon` | Icon name |
| `tone` | `blue`, `green`, `gold`, `rose`, `purple` |
| `trend` | Small change chip (`.delta`) |
| `to` | Optional link; the tile becomes keyboard accessible |

Classes: `.tile.tile-row`, `.tile-ico`, `.tile-body`, `.tile-label`, `.tile-val`. Stat tiles never filter the list below them.

### 6.4 StatusBadge

A dot with a halo, then the text. Tones:

| Tone | Colour | Aliases |
|---|---|---|
| `pending` | Amber | |
| `approved` | Green | paid, accepted, closed |
| `rejected` | Red | |
| `review` | Sky | clarification |
| `draft` | Slate | |

### 6.5 Modal

Built on Radix Dialog. Props: `open`, `onOpenChange`, `title`, `description` (read by screen readers; falls back to the title). Classes: `.modal-backdrop`, `.modal`, `.modal-head`, `.close`, `.modal-body`. Focus is trapped and returns to the trigger on close; Esc closes.

### 6.6 Form fields (`Field.tsx`)

| Component | Purpose |
|---|---|
| `FormGroup` | Label, required marker, helper text, error message, `full` width, render-prop for the control |
| `Input`, `Select`, `Textarea` | Styled controls (forward refs; work with react-hook-form) |
| `CheckRow` | Checkbox with label |

Errors appear under the control and are linked with `a11y(id, description, error)` so screen readers announce them.

### 6.7 TablePanel

The standard data table (`src/shared/ui/data/TablePanel.tsx`).

| Prop | Meaning |
|---|---|
| `title`, `subtitle` | Panel heading |
| `columns` | `{ header, kind, cell, csv?, className? }` |
| `rows`, `rowKey` | Data and unique key |
| `searchText` | Function returning searchable text for a row |
| `statusOf` | Returns the status used by the filter chips |
| `action` | Button area (for example "Add user") |
| `searchPlaceholder` | Default "Search records…" |
| `exportName` | File name for CSV export |
| `footNote`, `className` | Optional |
| `chipLimit`, `chipRank`, `chipNoun`, `initialPicked` | Control the status filter chips |

Cell kinds: `c-id` (identifier), `c-sub` (secondary text), `c-amt` (amount, right-aligned), `c-status` (badge), `c-more` (row actions).

Built-in: search, status chips (overflow goes into a searchable select), sortable headers (`.th-sort`), animated rows, empty state, "Export CSV" (requires step-up confirmation via `requireStepUp`). Under 899px rows become cards.

### 6.8 PageHead (`src/modules/shell/components/PageHead.tsx`)

Props: `crumb`, `title`, `desc`, `actions`. Renders the breadcrumb (home icon, module, parent group, current page with `aria-current="page"`), the `h1`, a one-line description and a right-aligned action area (`.head-actions`).

### 6.9 Extras (`Extras.tsx`)

| Component | Use |
|---|---|
| `Tabs` (`.seg-tabs`) | Switch between views on one page |
| `Note` (`.info-box`, `role="note"`) | Guidance, warnings, explanations |
| `KV` inside `.detail-grid` | Label and value pairs on detail pages |
| `Muted` | De-emphasised text |
| `VersionFields` | Version and effective-date fields |
| `MiniTable` (`.table-wrap.mini-table`) | Small table inside a card |

### 6.10 Other components

| Component | Notes |
|---|---|
| `EmptyState` | `icon` (default inbox), `title`, children for guidance or an action |
| `Avatar`, `Who` | Initials with a deterministic colour; `Who` adds `name` and `sub` |
| `SearchSelect` | Searchable dropdown for long lists |
| `BulkUpload` | Drop zone and validation list (`.bulk-*`, `.drop-zone`) |
| `BarsCard`, `DonutCard`, `TrendChart` | Charts using the chart tokens |
| Toasts | Call `notify(...)`; displayed as `.toast` or `.snack` |
| Popovers | Notifications and role menu (`.pop`, radius 16px) |

### 6.11 Other CSS building blocks

`components.css`: card, tile, tiles, bento, dash-grid, grid, toolbar, search-wrap, field, chips, seg-tabs, check-row, check-grid, form-layout, form-grid, form-group, form-actions, detail-grid, info-box, table-wrap, table-panel, table-foot, cell-pill, status, who, av, timeline, step, meter, ring, donut, chart, activity, alist, arow, notification list, faq-row, plan, vswitch, empty-state, snack, toast.

`core.css`: login and registration, public pages (`pub-*`), organisation chart (`org-*`), `section-t`, `stack`, radio cards, list rows, site rows, file card, geography (`geo-*`), flow, gauge, swatch.

`shell.css`: header, sidebar, nav item, footer, command search, header buttons, role chip, switch, mini profile, overlay, keyboard hint, live indicator.

---

## 7. Page patterns

### 7.1 List page

`PageHead` → optional row of `StatTile` → `TablePanel`.
Reference: `modules/audit/pages/AuditTrail.tsx`.

### 7.2 Detail page

`PageHead` → `Card`s containing a `.detail-grid` of `KV`, `section-t` headings, `MiniTable` and `Note`.
Reference: `modules/approvals/pages/ApprovalDetail.tsx`.

### 7.3 Form page

`PageHead` with a Back action → `.form-layout`: a left `Card` holding numbered `section-t` sections and `form-actions`; a right `.stack` of supporting cards (help, summary, rules).
Reference: `modules/approvals/pages/ChainNew.tsx`.

`form-actions` order: secondary actions first (Cancel), then the one primary action (Save or Create).

### 7.4 Confirm dialog

`Modal` with one short paragraph, an optional `Note`, and `form-actions` with Cancel and a primary or danger button. State the consequence in the paragraph.
Reference: `modules/organisation/components/ConfirmDialog.tsx`.

### 7.5 Login and registration

Use the same header as the rest of the application. The form sits in a centred card on the page background.

---

## 8. Content and wording conventions

- **Language:** British English (organisation, authorise, colour).
- **Case:** sentence case for buttons, labels, helper text and messages. Title Case for table headers, card titles and stat labels (applied with `titleCase` / `headingCase`).
- **Tone:** professional and simple. Short sentences, no jargon, no blame.
- **Subtitles** describe what the user can do, in one sentence. Example: "View and manage user accounts and their access."
- **Confirmation messages** name the action and its effect. Example: "Reset the password for this user? A new sign-in link will be sent to their registered email."
- **Fixed terms:** "Head Office", product name "CORE", "Core Users", "Module Administrators".
- **Do not rename internal values** such as the `UserRole` value `'Module head'`; change only the display text.
- **Dates:** `d MMM yyyy` (for example 5 Mar 2026). **Money:** ₹ with Indian grouping; short form ₹ Cr / ₹ L.

---

## 9. Icons, charts and formatting

- **Icons:** Lucide, referenced by semantic name from `ICON_NAMES` in `src/shared/ui/icons.tsx` (about 130 names). Use an existing name; add a new name to the map rather than importing icons directly. An invalid name (for example `folder`; use `folderTree`) fails the type check.
- **Charts:** use `BarsCard`, `DonutCard` or `TrendChart`. Use chart tokens only. Always provide a text label or table alternative.
- **Formatting helpers** (`src/shared/lib/format.ts`): `money`, `moneyShort`, `fmtDate`, `fmtDateTime`, `fmtShort`, `ago`, `todayISO`, `relDay`, `initials`, `avatarTone`, `titleCase`, `headingCase`.
- **Motion:** `useEnter(ref, name)` for staggered entrance, `AnimatedValue` for count-up. Both respect reduced motion.
- **Utilities:** `cn` (class names), `a11y(id, description, error)`, `notify`, `requireStepUp`, `toCsv` / `downloadText`.

---

## 10. Accessibility, theming and dark mode

- Every interactive element is reachable by keyboard and shows the focus ring.
- Inputs have visible labels; errors are announced.
- Colour is never the only signal: statuses also show text.
- Contrast meets WCAG AA for text on every surface in both themes.
- Theme is stored in local storage (`useShell`) and applied as the `dark` class on `<html>`.
- Never hard-code a colour in a component. Use a token so dark mode works automatically.

---

## 11. Module adoption checklist

Before a new module ships, confirm:

- [ ] The shell (header, sidebar, footer, dock) is used unchanged; only the navigation config differs.
- [ ] `data-variant="classic"` is set and dark mode works.
- [ ] Every page starts with `PageHead` and a breadcrumb.
- [ ] Lists use `TablePanel`; forms use `.form-layout` with `FormGroup`.
- [ ] Only shared components and tokens are used; no new colours, radii or fonts.
- [ ] One primary button per screen.
- [ ] Wording follows section 8 (British English, sentence case, professional tone).
- [ ] Icons come from the shared map.
- [ ] Works at 1440, 1024, 768 and 375px widths.
- [ ] Keyboard and screen-reader pass completed.
- [ ] Modules import other modules only through their public `index.ts`.

---

## 12. Reference files

| Topic | Path |
|---|---|
| Token summary | `docs/DESIGN.md` |
| Tokens and theme | `src/app/styles/index.css`, `base.css`, `variant-classic.css` |
| Component styles | `src/app/styles/components.css`, `core.css`, `shell.css` |
| Shell | `src/modules/shell/components/` (Shell, Header, Sidebar, Footer, Dock, PageHead) |
| Navigation | `src/modules/shell/config/nav.ts` |
| Shared UI | `src/shared/ui/` |
| Formatting | `src/shared/lib/format.ts` |
| Logos | `assets/logo/`, `src/shared/assets/veloxiq-logo.svg` |
