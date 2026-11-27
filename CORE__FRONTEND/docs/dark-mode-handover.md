# VeloxIQ Core: dark mode handover

Purpose: how the application looks in dark mode, screen by screen, and the exact values to reuse in another module. This is the dark-mode companion to `styling-handover.md` (light mode and the shared rules). Read that file first for the component classes and the copper-gold rim.

Paths are relative to `CORE__FRONTEND\src\`.

---

## 1. How dark mode is switched on

| Piece | Where | What it does |
|---|---|---|
| Theme state | `modules/shell/store/useShell.ts` (`theme`) | `'light'` or `'dark'`, changed by the header switch |
| Document sync | `modules/shell/hooks/useDocumentTheme.ts` | Adds the `dark` class to `<html>`, sets `color-scheme` to the theme, and sets `data-sidebar` |
| Variant | `index.html` | `<html data-variant="classic">`; the dark token block is `html.dark[data-variant="classic"]` |
| Header switch | shell header (`Switch` / theme toggle) | Calls the shell store to flip `theme` |

The application reads the theme once on load and follows the header switch while it is open. A new module must set the `dark` class on `<html>` and `color-scheme: dark` on the root, or the dark rules will not apply.

---

## 2. Dark tokens (set on `html.dark[data-variant="classic"]`)

Use these names. Do not write hex values into components.

| Token | Dark value | Notes |
|---|---|---|
| `--page` / `--canvas` | `#070D1F` | page background (flat) |
| `--card` | `#0F1830` | used by components that read `--card` directly (secondary buttons, some popovers) |
| `--card-solid` | `#0F1830` | opaque fill |
| `--card-2` | `#131E3D` | table header, chip and tab fills |
| `--field` | `#131E3D` | input fill (overridden for `.field` in section 6.3) |
| `--card-b` | `#22305A` | card border tokens (cards use the light-blue border in section 4) |
| `--line` | `#22305A` | dividers |
| `--line-2` | `#1A2750` | row dividers |
| `--ink` | `#EDF0FA` | primary text (outside light-blue surfaces) |
| `--ink-2` | `#C5CDE6` | secondary text |
| `--muted` | `#93A0C6` | captions and helper text |
| `--green` / `--green-bg` | `#58D6A2` / `#123A33` | approved, closed |
| `--amber` / `--amber-bg` | `#F0C06A` / `#3B2F18` | pending, planned |
| `--red` / `--red-bg` | `#F08E8B` / `#3F2230` | rejected, errors |
| `--sky` / `--sky-bg` | `#8EAEFA` / `#172C5A` | review, clarification, info |
| `--slate` / `--slate-bg` | `#A5B0CF` / `#1D2A4F` | draft, neutral pills |
| `--grad` | `linear-gradient(135deg,#17306F 0%,#0B1A44 100%)` | active navigation item |
| `--grad-btn` | `linear-gradient(135deg,#CF8477,#A9594D)` | primary buttons, pressed chips |
| `--glow` | `0 8px 20px -8px rgba(194,125,112,.5)` | glow under primary buttons |
| `--shadow` | `0 1px 2px rgba(0,0,0,.3),0 12px 32px -16px rgba(0,0,0,.6)` | cards, popovers |
| `--shadow-lg` | `0 24px 60px -20px rgba(0,0,0,.7)` | dialogs |
| `--chart-1` / `--chart-2` | `#8EAEFA` / `#DE9C90` | chart series |
| `color-scheme` | `dark` | native controls (scrollbars are hidden in the app) |

Status pill colours in dark mode are the `--*-bg` tokens with the `--*` text colours. Do not use the light-mode colours in dark.

---

## 3. The main rule: light-blue surfaces on a dark page

In dark mode the application keeps its dark page, sidebar and header, but **every card, panel and stat tile is light blue inside, with dark text.** The rule is declared in `styles/core.css` ("Dark mode, whole application"):

```css
html.dark .card, html.dark .panel, html.dark .tile, html.dark .tile.tile-row {
  background: #d9eefa;
  border-color: #a9d3ee;
  color: #0b1530;
}
html.dark .card td, html.dark .card th, html.dark .panel td, html.dark .panel th {
  background: transparent;
  color: #0b1530;
  border-color: #b9d9ef;
}
html.dark .card tbody tr:hover td, html.dark .panel tbody tr:hover td { background: #c6e4f6; }
html.dark .card .card-t, html.dark .panel .card-t, html.dark .card h2, html.dark .card h3 { color: #0b1530; }
html.dark .card .card-s, html.dark .panel .card-s { color: #2a3a55; }
html.dark .tile .tile-val, html.dark .tile-row .tile-val { color: #0b1530; }
html.dark .tile .tile-label, html.dark .tile-row .tile-label { color: #2a3a55; }
```

Consequences:
- Table cells inside cards are transparent on the light blue.
- Text inside a card is `#0b1530` (ink) and secondary text is `#2a3a55`.
- Status pills keep their dark-mode colours; check their contrast on `#d9eefa` (section 8).

Surfaces that stay dark: the page, the header, the sidebar (except the card colours in section 5), popovers that use `--card`, and the secondary buttons.

---

## 4. Colours of the surfaces (dark mode)

| Surface | Fill | Border | Text |
|---|---|---|---|
| Card, panel | `#d9eefa` | `#a9d3ee` | `#0b1530`; subtitle `#2a3a55` |
| Table cell in a card | transparent (on the card) | `#b9d9ef` | `#0b1530` |
| Table row hover in a card | `#c6e4f6` | | |
| KPI tile | `#d9eefa` | `#a9d3ee` | value `#0b1530`; label `#2a3a55` |
| Input (`.field`) | `#d9eefa` with a light sheen | `#a9d3ee` | `#0b1530`; placeholder `#4a6b86` |
| Input focus / filled | `#d9eefa` | `#a9d3ee` (focus ring from `styling-handover.md`) | `#0b1530` |
| Login and registration card | `#d9eefa` with a white sheen | copper-gold rim (`styling-handover.md` §3) | `#0b1530`; subtitle `#14203a`; footer `#2a3a55` |
| Modal | `--card-solid` (dark) | `--line` | `--ink` |
| Popover (`.pop`) | `--card-solid` (dark) | `--line` | `--ink` |
| Profile popover | `#d9eefa` | `#a9d3ee` | `#0b1530`; search field `#eff8fd`; option selected `rgba(11,21,48,.08)` |
| Chart tooltip (`.chart-tip`, `.chart-tip2`) | `#d9eefa` | `#a9d3ee` | `#0b1530`; shadow `0 8px 24px rgba(10,20,60,.25)` |
| Toast (`.toast`) | `#27306A` | | white |
| Snackbar (`.snack`) | `#27306A` | | white |
| Tooltip (`.tt`) | `#2A3567` | | white |
| Recharts tooltip | `#d9eefa` (`!important`) | `#a9d3ee` | `#0b1530` |
| Recharts hover cursor | `#b9dcf2` at 55 % opacity | | |

---

## 5. Application shell

- **Page background:** `--page` `#070D1F`, with `color-scheme: dark`.
- **Header:** the dark header from the classic variant; the logo sits on `--chrome` in dark mode (`.login-logo` only).
- **Sidebar:**
  - background `#d9eefa`, text `#0b1530`, border `#a9d3ee`;
  - nav item text `#0b1530`; hover fill `rgba(11,21,48,.08)`;
  - active item fill `#1b3a7e` with white text;
  - group labels `#2a3a55`;
  - the mini profile card fill `#eff8fd`, text `#0b1530`.
  - (The shell CSS of the light variant uses `--card-solid` for the sidebar; the dark rule overrides it.)
- **Footer:** the 2 px rose rule and the navy line stay; the text uses `--muted`.
- **Notifications:** the bell and badge (`#E2564A` dot with a `--chrome` border) keep their colours.

---

## 6. Controls

### 6.1 Buttons
| Variant | Dark look |
|---|---|
| Primary `.btn.primary` | fill `--grad-btn` (`#CF8477 → #A9594D`), white text, glow `--glow` |
| Secondary `.btn.secondary` | fill `--card` (`#0F1830`), ink text, copper-gold rim with the dark fill (`styling-handover.md` §3); hover `--card-solid` |
| Danger `.btn.danger` | fill `--red-bg` `#3F2230`, text `--red` `#F08E8B` |
| Success `.btn.success` | gradient `#27BC8A → #0F8F68`, white text (unchanged) |
| Public home primary (`.pub-home .pub-cta .btn.primary`) | gradient `#cf8477 → #a9594d`, copper rim |
| Public home secondary | white fill `#ffffff`, dark text `#0b1530`, copper rim |
| Public home navigation (active) | fill `#1b3a7e`, white text |

Disabled buttons keep the same fill at reduced opacity.

### 6.2 Tabs and chips
- Tab switch `.seg-tabs`: fill `--card-2` `#131E3D`, border `--line`; pressed tab fill `--card-solid` `#0F1830`, ink text, shadow `0 2px 10px rgba(10,20,60,.15)`.
- Chip `.chip`: fill `--card-2`, border `--line`, text `--ink-2`; pressed chip `--grad-btn`, white text.

### 6.3 Inputs and selects
- `.field` (and the register and profile variants): fill `#d9eefa` with a light sheen, border `#a9d3ee`, text `#0b1530`, placeholder `#4a6b86`. Focus and filled fields keep `#d9eefa`; focus ring `0 0 0 4px rgba(61,90,241,.16)` with the border `--blue`.
- Custom select trigger (`.ss-trigger`): the dark fill `--card-2`, border `--line`, chevron `--muted`; hover and open border `--muted`.
- Profile selects (`.profile-selects .ss-trigger`): border hover `#3d5af1`; icons `#4a6b86`.

### 6.4 Status badges
Use the dark status tokens (section 2). Examples:
- approved, onboarded, closed: text `#58D6A2`, fill `#123A33`;
- pending, planned: text `#F0C06A`, fill `#3B2F18`;
- rejected: text `#F08E8B`, fill `#3F2230`;
- review, clarification, With HRMS: text `#8EAEFA`, fill `#172C5A`;
- draft: text `#A5B0CF`, fill `#1D2A4F`.

When a badge sits on a light-blue card, the dark fill still works, because the badge has its own fill.

### 6.5 Empty states and notes
- Empty state (`.empty-state`): text `--muted`; icon ring fill `--sky-bg` `#172C5A`, icon `--sky`.
- Note and info box (`.info-box`): gradient `rgba(227,150,138,.2) → rgba(139,108,240,.12)` over the dark page; text `--ink-2`.
- Login error (`.login-error`): fill `--red-bg`; on the login card it is `#fde7e4` with `#8a0f0f` text in both modes.

### 6.6 Maps
- Map tiles are darkened: `brightness(.78) contrast(1.08)` on the leaflet tile pane (`.geo-leaflet`).
- Route and fence lines use `--blue-2` `#4F7BE8`.

---

## 7. Screens (dark mode)

| Screen | What it looks like in dark mode |
|---|---|
| Sign in (`/login`, role choice) | Page `#070D1F`; the two role cards are light blue with dark text and the copper rim; "Login" heading white (`#eef2fa`); subtitle `#c9d3e6`. |
| Sign-in form | Card light blue with dark labels `#0b1530`; subtitle `#14203a`; footer `#2a3a55`; error box keeps its light-red look. |
| Register and password pages | Card light blue; title `#0b1530`; description `#2a3a55`. |
| Public home (`/`) | Page `#0e1424`; copy panel `#161e33` with border `#26314d`; heading `#eef2fa`, text `#d5dcea`; feature cards text `#edf0fa` and `#c9d3e6`; active tab `#1b3a7e`. |
| Dashboard | Dark page; KPI tiles light blue with dark values; request tables inside light-blue cards; chart tooltips light blue. |
| List pages (projects, stores, materials, equipment, approvals, policies, approved list) | Dark page with the header and the chips in dark tokens; the table in a light-blue card, header row transparent on the card; row hover `#c6e4f6`. |
| Request page (approvals) | Request, chain and decision cards light blue; decision buttons use the dark button styles; the "Waiting on" note is a light-blue note with dark text. |
| Policies | Policy cards light blue; "Open" and "Upload rate sheet" buttons keep their styles; the project filter is a `.ss-trigger` on the dark page. |
| Equipment register and planning | Tables in light-blue cards; availability pills use the status tokens; the wizard's section titles are `--ink` on the dark page. |
| Approved list and compare | Table cards light blue; "Reason" buttons use the secondary style; the reason text is `#0b1530` on the light blue. |
| Organogram | Boxes and lines drawn with the theme tokens; the organogram tag filter is brightened (`.org-dept-tag` `brightness(1.25)`). |
| Audit trail and sign-in history | Table cards light blue; status pills and module pills use the dark tokens. |
| Modal and dialogs | Dark `--card-solid` box, `--shadow-lg`, dark backdrop `rgba(5,10,32,.5)`. |

---

## 8. Contrast checks used

| Pair | Ratio (approx.) | Use |
|---|---|---|
| `#0b1530` on `#d9eefa` | high (above 12:1) | card text |
| `#2a3a55` on `#d9eefa` | high (above 8:1) | card subtitles |
| `#4a6b86` on `#d9eefa` | above 4.5:1 | placeholders (lowest accepted) |
| `#EDF0FA` on `#070D1F` | high | page text |
| `#93A0C6` on `#070D1F` | above 4.5:1 | captions on the page |
| `#F08E8B` on `#3F2230` | above 4.5:1 | red pills |
| `#58D6A2` on `#123A33` | above 4.5:1 | green pills |
| white on `#CF8477` / `#A9594D` | the primary button; check before using a lighter gradient | primary buttons |

Check every new colour against both surfaces: the dark page and the light-blue card.

---

## 9. Things to watch when porting

1. **The light-blue card rule is global.** It applies to every card, panel and tile when `html.dark` is set. A module that wants dark cards must scope its own rule, for example with a class, and must not change the global rule.
2. **Some components read `--card` directly.** Secondary buttons, the popover and some menus use the dark `--card`. On a light-blue card they look darker than the card. This is intended for buttons; check new components.
3. **Two sidebar rules exist.** The classic variant sets the sidebar to `--card-solid`; the dark rule in `core.css` overrides it to light blue. Keep the override if you copy the shell.
4. **The login and public pages have their own dark rules.** They are in `core.css` with the `pub-*` and `login-*` class names. Copy them only with those pages.
5. **Tooltips and toasts use fixed colours** (`#27306A`, `#2A3567`) rather than tokens. Keep them fixed or move them to tokens together.
6. **Map tiles are darkened with a filter**, not a separate map style. Keep the filter when adding a map.
7. **Hex values are fixed in several places** (section 4 and the login rules). Changing a token does not change them. List them when you change the palette.

---

## 10. Checklist for another module

- [ ] `<html data-variant="classic">` is set, and the theme hook sets the `dark` class and `color-scheme`.
- [ ] Dark token block copied (section 2).
- [ ] The light-blue card, panel and tile rule copied (section 3 and 4).
- [ ] The sidebar and nav rules copied (section 5), or the module shell is a dark page with light-blue cards only.
- [ ] Inputs, selects and tabs use the dark rules (section 6).
- [ ] Status pills use the dark tokens (section 6.4).
- [ ] Tables inside cards: transparent cells, dark text, row hover `#c6e4f6` (section 3).
- [ ] Each screen checked in dark mode, with the contrast table (section 8).
- [ ] The map filter, if the module has a map (section 6.6).
- [ ] Light mode still correct after the change (see `styling-handover.md`).

---

## 11. Source files

| Topic | File |
|---|---|
| Dark tokens and light tokens | `src/app/styles/variant-classic.css` |
| Light-blue cards, sidebar, login, public pages, inputs, tooltips | `src/app/styles/core.css` |
| Buttons, cards, tabs, chips, tables, status badges, popovers (base) | `src/app/styles/components.css` |
| Shell and sidebar base | `src/app/styles/shell.css` |
| Theme state and the document class | `src/modules/shell/hooks/useDocumentTheme.ts`, `src/modules/shell/store/useShell.ts` |
