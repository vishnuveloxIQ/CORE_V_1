# VeloxIQ Core: styling handover

Purpose: everything another module needs to look and behave like this application: colours, borders, radii, shadows, type, spacing, components, dark mode, and the layout rules. Use it with the design rules in `handover-implementation.md`.

The styling is plain CSS with CSS custom properties (tokens). Tailwind is imported, but the components use the classes in `components.css`, `core.css`, `shell.css` and `variant-classic.css`. Copy those files and this document's token values to get the same look.

Paths below are relative to `CORE__FRONTEND\src\app\`.

---

## 1. Files to take

| File | What it holds |
|---|---|
| `styles/index.css` | Entry. Imports the other files in this order: `base.css` (layer base), then `components.css`, `shell.css`, `variant-classic.css`, `core.css` (layer components). Maps tokens into Tailwind's theme. |
| `styles/base.css` | `body` background, text colour, font, smoothing. |
| `styles/components.css` | Buttons, cards, tiles, tabs, chips, inputs, tables, status badges, page heading, breadcrumbs, empty states, modals, popovers. |
| `styles/shell.css` | Layout shell: header, sidebar, nav, drawer, mobile rules. |
| `styles/variant-classic.css` | **The tokens.** Light values in `html[data-variant="classic"]`, dark values in `html.dark[data-variant="classic"]`, plus the flat "classic" overrides for surfaces, radii and tables. |
| `styles/core.css` | Copper-gold rims, page backgrounds, login and public pages, tab rims, map-related and compare-page rules. |

`index.html` must set `<html data-variant="classic">`. Dark mode is the `dark` class on `<html>`, toggled by `src/modules/shell/hooks/useDocumentTheme.ts`.

Fonts come from the npm packages `@fontsource-variable/inter` and `@fontsource-variable/plus-jakarta-sans`, imported once in `src/main.tsx`.

---

## 2. Colour tokens

Set on `html[data-variant="classic"]` (light) and `html.dark[data-variant="classic"]` (dark). Use these names; do not hard-code hex values in components.

### 2.1 Surfaces and text

| Token | Light | Dark | Use |
|---|---|---|---|
| `--page` / `--canvas` | `#F2F4FA` | `#070D1F` | body background (flat); the light pages use the gradient in section 6 |
| `--card` | `#FFFFFF` | `#0F1830` | card, panel, tile, popover fill |
| `--card-solid` | `#FFFFFF` | `#0F1830` | opaque card fill (hover, pressed tab) |
| `--card-2` | `#F7F8FC` | `#131E3D` | table header, inset panels, chips, secondary fills |
| `--field` | `#FFFFFF` | `#131E3D` | input fill |
| `--card-b` | `#E3E7F1` | `#22305A` | card border |
| `--line` | `#E3E7F1` | `#22305A` | dividers, input border |
| `--line-2` | `#ECEFF7` | `#1A2750` | row dividers in tables |
| `--ink` | `#0C1A3D` | `#EDF0FA` | primary text |
| `--ink-2` | `#37446A` | `#C5CDE6` | secondary text in tables and lists |
| `--muted` | `#68738F` | `#93A0C6` | captions, helper text, placeholders |

### 2.2 Brand

| Token | Light | Dark | Use |
|---|---|---|---|
| `--navy` | `#062258` | (same) | primary dark brand; footer and gradient end |
| `--blue` | `#123C94` | (same) | links, focus ring, primary gradient start |
| `--blue-2` | `#4F7BE8` | (same) | hover accent (dark mode nav icons) |
| `--rose` | `#DE9C90` | (same) | rose accent |
| `--rose-d` | `#C27D70` | (same) | rose accent used on headings and the footer rule |
| `--grad` | `linear-gradient(135deg,#123C94 0%,#062258 100%)` | `linear-gradient(135deg,#17306F 0%,#0B1A44 100%)` | active nav item |
| `--grad-btn` | `linear-gradient(135deg,#123C94,#062258)` | `linear-gradient(135deg,#CF8477,#A9594D)` | primary buttons, pressed chips |
| `--glow` | `0 8px 20px -8px rgba(6,34,88,.55)` | `0 8px 20px -8px rgba(194,125,112,.5)` | glow under primary buttons and pressed chips |

### 2.3 Status colours (each has a foreground and a soft background)

| Meaning | Foreground | Background (light) | Foreground (dark) | Background (dark) |
|---|---|---|---|---|
| Green / ok / approved | `--green` `#12775A` | `--green-bg` `#E2F5EC` | `#58D6A2` | `#123A33` |
| Amber / pending / warning | `--amber` `#8F5B0E` | `--amber-bg` `#FFF1D3` | `#F0C06A` | `#3B2F18` |
| Red / rejected / error | `--red` `#B03535` | `--red-bg` `#FCE8E8` | `#F08E8B` | `#3F2230` |
| Sky / review / info | `--sky` `#2A56BE` | `--sky-bg` `#E6EDFD` | `#8EAEFA` | `#172C5A` |
| Slate / draft / neutral | `--slate` `#5B6685` | `--slate-bg` `#EDF0F6` | `#A5B0CF` | `#1D2A4F` |

Charts: `--chart-1` `#8EAEFA` and `--chart-2` `#DE9C90` in dark mode. Light chart colours are set in the same file.

### 2.4 Other fixed colours used in the code

| Value | Where |
|---|---|
| `#E2564A` | notification badge dot (`.badge-dot`) |
| `#0B1230` | tooltip and toast background (`.chart-tip`, `.toast`, `.snack`) |
| `#27BC8A` → `#0F8F68` | success button gradient (`.btn.success`) |
| `#8a0f0f` text on `#fde7e4` | login error box (`.login-card .login-error`) |
| `rgba(5,10,32,.5)` | modal backdrop |
| `rgba(61,90,241,.35)` / `rgba(61,90,241,.16)` | input hover border and focus ring |

---

## 3. The copper-gold rim (signature border)

Cards, plain buttons, secondary buttons, tab switches and the Select trigger on the site filter use the same two-layer border. It is drawn with a transparent border and two backgrounds: the fill (inside) and the copper gradient (border area).

```css
border: 2.5px solid transparent;
background:
  linear-gradient(var(--card-solid), var(--card-solid)) padding-box,
  linear-gradient(135deg,#fbe3d4 0%,#e0a286 22%,#b96d52 46%,#e8b39a 64%,#f7d9c6 82%,#c98b72 100%) border-box;
box-shadow:
  inset 0 0 0 1px rgba(226,233,245,.9),
  inset 0 1px 0 rgba(255,255,255,.55),
  0 3px 8px rgba(10,20,60,.12);
```

Where it is used:
- Cards and panels: `html .card` (fill `--card-solid`, shadow `0 3px 8px rgba(10,20,60,.12)`).
- Buttons: `html .btn` (2.5 px transparent border); secondary buttons use the rim with the card fill and shadow alpha `.14`.
- Tab switches: `html .seg-tabs` (rim with card fill).
- Login and public-page buttons: 4 px rim, same gradient, white fill, extra inset shadow `inset 0 0 0 1px rgba(226,233,245,.9)`.
- Site project filter trigger: rose-gold fill with the copper rim.

The primary button does not use the rim; it uses `--grad-btn` with the same 2.5 px transparent border.

---

## 4. Shape, shadow and motion

| Token / value | Value | Notes |
|---|---|---|
| `--r` | `18px` | card and panel radius (`.card`, `.panel`) |
| `--r-sm` | `12px` | small radius |
| `--btn-r` | `12px` | button radius in the classic variant (default elsewhere: `99px`, a pill) |
| tile radius | `16px` (classic), `24px` (base) | KPI tile |
| `.field` radius | `12px` (classic), `16px` (base) | inputs |
| `.chip` radius | `10px` (classic), `99px` (base) | filter chips |
| `.status` radius | `8px` (classic) | status badge |
| `.cell-pill` radius | `8px` (classic) | type pill |
| `.modal` radius | `22px` | dialog |
| `.pop` radius | `16px` | popover |
| `.seg-tabs` radius | `12px` (classic), `99px` (base) | tab switch container; inner buttons `9px` (classic) |
| `--shadow` | `0 1px 2px rgba(12,26,61,.04),0 10px 30px -14px rgba(12,26,61,.16)` (light); `0 1px 2px rgba(0,0,0,.3),0 12px 32px -16px rgba(0,0,0,.6)` (dark) | cards |
| `--shadow-lg` | `0 24px 60px -20px rgba(12,26,61,.35)` (light); `0 24px 60px -20px rgba(0,0,0,.7)` (dark) | dialogs, toasts |
| `--blur` | `none` (classic light) | `backdrop-filter` tokens; the base file uses `blur(22px) saturate(1.5)` on the sidebar |

Motion:
- Buttons: `transition: transform .18s, box-shadow .18s, background .18s, filter .18s`; hover lifts `translateY(-2px)`; press scales `.97`.
- Nav item hover: background `--card-2`; icon colour `--blue` (dark: `--blue-2`).
- Inputs: `transition: border-color .15s, box-shadow .15s, background .15s`; focus ring `0 0 0 4px rgba(61,90,241,.16)`.
- Modal backdrop: `rgba(5,10,32,.5)` with fade-in `.2s ease-out`.
- Tiles: `transform .25s cubic-bezier(.3,1.3,.5,1)` on hover.
- Sidebar width change: `.28s cubic-bezier(.3,.8,.3,1)`.

---

## 5. Typography

| Role | Font | Size / weight | Notes |
|---|---|---|---|
| Body | `--font` = Inter Variable, Inter, system-ui, Segoe UI, Roboto, sans-serif | 14 px / 400 / line-height 1.55 | `-webkit-font-smoothing: antialiased` |
| Headings and numbers | `--font-d` = Plus Jakarta Sans Variable, Inter Variable, system-ui | varies | used for page titles, card titles, KPI values |
| Page title (`.ph h1`) | `--font-d` | `clamp(28px, 3.2vw, 40px)` / 700 / line-height 1.08 / letter-spacing `-.035em` | |
| Page description (`.ph p`) | `--font` | 14 px / muted / max 62 ch | |
| Card title (`.card-t`) | `--font-d` | 17 px / 700 / letter-spacing `-.015em` | |
| Card subtitle (`.card-s`) | `--font` | 14 px / 1.5 / muted | |
| Section title (`.section-t`) | `--font-d` | 14 px / 700 | margin 22 px top, 12 px bottom |
| KPI value (`.tile-val`) | `--font-d` | `clamp(22px, 2.2vw, 30px)` / 700 / line-height 1.1 / letter-spacing `-.04em` | |
| KPI label (`.tile-label`) | `--font` | 13 px / 600 | |
| KPI note (`.tile-note`) | `--font` | 11.5 px / muted | |
| Table header (`th`) | `--font` | 12.5 px / 700 / muted | classic: background `--card-2`, padding 11 px 16 px |
| Table cell (`td`) | `--font` | 13.5 px / `--ink-2` | padding 14 px 16 px |
| Sub-line in a cell (`td .sub`) | `--font` | 12 px / muted | |
| Status badge (`.status`) | `--font` | 12 px / 700 | |
| Button (`.btn`) | `--font` | 13.5 px / 650 | small button 12.5 px |
| Field label (`.form-group > label`) | `--font` | 13 px / 650 | |
| Helper text (`.helper`) | `--font` | 12 px / muted | |
| Required marker (`.required`) | `--font` | colour `--red` | |
| Breadcrumb (`.crumbs`) | `--font` | 12 px / 600 / muted; current item `--ink` 650 | |
| Empty state title (`.empty-state strong`) | `--font-d` | 16 px / 650 | |
| Upper-case group label (nav labels) | `--font` | 10.5 px / 700 / letter-spacing `.12em` / uppercase / muted | |
| Numbers in tables (`.amount`, `.c-amt`) | `--font` | tabular numbers, bold for totals | right-aligned |

Font features: `font-variant-numeric: tabular-nums` on amounts and IDs.

---

## 6. Backgrounds

**Light mode (pages that use the rose-gold wash):** `.pub-page`, `.login-page`, `.pub-home`, and `.shell-classic .main`:

```css
background:
  linear-gradient(115deg, rgba(255,255,255,0) 30%, rgba(255,255,255,.5) 46%, rgba(255,255,255,0) 62%),
  linear-gradient(135deg, #f9d3d8 0%, #fdeef0 32%, #f0b4bd 62%, #fae0e4 85%, #e89aa6 100%);
background-attachment: fixed;
```

The light-cherry tint is the current value. The earlier rose-gold values were `#f7e4dd`, `#fbf1ed`, `#eccfc3`, `#f8e7e1`, `#e9c9bc`.

**Other light pages:** `--page` `#F2F4FA` (flat).

**Dark mode:** `--page` `#070D1F`, with `color-scheme: dark`.

**Footer rule:** 2 px line `linear-gradient(90deg, transparent, var(--rose-d) 45%, var(--navy))` at the top of the footer.

**Header rule:** 2 px accent line `linear-gradient(90deg, #062258 0%, #C27D70 55%, transparent 100%)` (`--accent-line`).

---

## 7. Layout

Shell (classic variant):
- Header: height `--hh`, padding `0 16px 0 12px`, no shadow.
- Sidebar: fixed, left, under the header, width `--sbw`, background `--card-solid`, right border `1px solid --line`, no radius, no shadow.
- Main: `margin-left: --sbw`, padding `26px clamp(14px, 1.8vw, 32px) 0`.
- Content: `max-width: none`, padding bottom 32 px.
- Footer: negative horizontal margin to meet the screen edges, padding `12px clamp(14px,1.8vw,32px)`, minimum height 52 px, text 11.5 px.

Grid helpers:
- `.grid` gap 16 px.
- `.stats` (4 KPI tiles): `repeat(4, minmax(0,1fr))`, margin-bottom 16 px.
- `.tiles`: `repeat(4, 1fr)` with gap 16 px (default).
- `.dash-grid`: `1.25fr 1fr`.
- `.form-grid`: form fields in a grid; `.form-grid-4`, `.detail-grid` variants.
- `.toolbar`: flex, gap 12 px, padding `12px 22px 6px`, wraps.
- `.table-wrap`: horizontal scroll, padding `0 14px 8px` (classic `0 4px 4px`).
- `.fit-table`: table sized to content; action column `th.c-act` 170 px; `.row-actions` a 150 px grid with 6 px gap; buttons full width, 36 px high.

Breakpoints used in the code:
- 1380 px: KPI grids to 2 columns, dash grid to 1 column.
- 1100 px: form layout to one column; tiles to 2 columns.
- 1000 px: 4-column grids to 2 columns.
- 900 px: sidebar becomes a drawer (min(216 px, 62 vw) wide, slides in).
- 700 px: nav labels hidden; header tweaks.
- 600 px: tables become stacked cards (`tbody tr` with 14 px radius and card fill); buttons and forms stack; tiles and stats in 2 columns; `form-grid-4` to one column.
- 380 px: tiles and stats to one column.

Mobile rules (under 600 px): `.table-wrap` loses its horizontal scroll; `table, tbody` become blocks; `thead` is hidden; each `td` shows its `data-label` as a label (`::before`). Keep this in mind when building new tables.

---

## 8. Components

### 8.1 Buttons

Base `.btn`: inline flex, centred, gap 8 px, minimum height 44 px, padding `0 20 px`, radius `--btn-r`, border 1 px transparent, text 13.5 px / 650, no wrap, icon 18 px.

| Variant | Class | Look |
|---|---|---|
| Primary | `.btn.primary` | fill `--grad-btn`, white text, `--glow` shadow; hover brightness 1.1 |
| Secondary | `.btn.secondary` | copper rim (section 3), fill `--card`, ink text; hover fill `--card-solid` |
| Danger | `.btn.danger` | fill `--red-bg`, text `--red` |
| Success | `.btn.success` | gradient `#27BC8A → #0F8F68`, white text, shadow `0 10px 24px -10px rgba(15,143,104,.7)` |
| Plain / tone | `.btn` with `tone="secondary"`, etc. | follows the rim rule |
| Small | `.btn.sm` | min height 34 px, padding `0 15 px`, text 12.5 px, icon 16 px |
| Icon-only round (table) | `.arow .go` | 36 px circle, fill `--card-solid`, shadow `0 1px 4px rgba(10,20,60,.12)`; hover fill `--grad-btn`, white icon |

Disabled buttons: reduced opacity and no hover lift (use the browser's disabled state).

### 8.2 Cards, panels and tiles

- `.card`, `.panel`: fill `--card`, border 1 px `--card-b` (or the copper rim in the app's current style), radius `--r`, shadow `--shadow`, `overflow: hidden`.
- Card header: title (section 5), subtitle, optional action on the right.
- Card body: padding `12px 24px 24px` (mobile `10px 18px 20px`).
- KPI tile (`.tile`): radius 24 px (classic 16 px), padding `18px 18px 16px`, fill `--card`, border `--card-b`, shadow `--shadow`; an icon square (`.tile-ico`, 46 px, radius 16 px, fill `--tb`, icon `--t`) and value below it. Tile colour comes from `--t` (text/icon) and `--tb` (soft fill): sky, green (`t-green`), gold (`t-gold`, amber), rose (`t-rose`, `#C0594A` on `rgba(227,150,138,.22)`), purple (`t-purple`, `#6C4FD8` on `rgba(139,108,240,.18)`).

### 8.3 Tabs and chips

- Tab switch `.seg-tabs`: inline flex, padding 4 px, radius 99 px (classic 12 px), fill `--card-2`, border 1 px `--line` (app style: copper rim). Buttons: padding `7px 14px`, 12 px / 650, muted; pressed button fill `--card-solid`, ink text, shadow `0 2px 10px rgba(10,20,60,.15)`.
- Filter chip `.chip`: inline flex, gap 7 px, border 1 px `--line`, fill `--card-2`, padding `7px 14px` (classic `6px 12px`, radius 10 px), 12.5 px / 650, ink-2. Count badge inside (`em`). Pressed chip: `--grad-btn`, white text, border transparent, `--glow`.

### 8.4 Inputs and selects

- `.field`: min height 46 px, border 1 px `--line`, radius 16 px (classic 12 px), fill `--field`, padding `10px 16px`, 13.5 px ink, placeholder `--muted`.
- Hover: border `rgba(61,90,241,.35)`. Focus: border `--blue`, ring `0 0 0 4px rgba(61,90,241,.16)`, fill `--card-solid`.
- Select hover: border `--muted`.
- Search box (`.search-wrap`): flex `0 1 280px`, min width 200 px, field radius 99 px (classic 12 px), min height 42 px, left padding 44 px, search icon 20 px at 15 px from the left.
- Custom select (`.ss-trigger`): min height 36 px, border 1 px `--line`, radius 99 px, fill `--card-2`, padding `6px 12px 6px 14px`, 12.5 px / 650; hover and open border `--muted`; chevron 16 px.
- Custom select popup (`.ss-pop`): fill `--card`, border `--line`, radius 14 px, shadow `0 12px 32px rgba(0,0,0,.18)`, padding 8 px. Options: 13 px, hover fill `--card-2`.

### 8.5 Tables

- Header row: text 12.5 px / 700 / muted, no wrap; classic: fill `--card-2`, bottom border `--line`, padding 11 px 16 px.
- Body cells: padding 14 px 16 px; 13.5 px / `--ink-2`; classic: transparent fill, bottom border `--line-2`; last row no border.
- Row hover: fill `--card-2` (classic) or `--card-solid` with border `--line` (base).
- Strong text in cells: `--ink`, 650.
- Sub-line: block, 12 px, muted.
- ID link (`.id-link`): `--sky`, 700, tabular numbers, underline on hover. Button version: no padding, no border, inherits font.
- Pill in a cell (`.cell-pill`): inline, 12 px / 600, padding `4px 12px`, fill `--slate-bg`, text `--ink-2`, radius 8 px (classic).
- Totals and counts: `.amount` bold, tabular, nowrap.
- Column kinds used by `TablePanel`: `c-id` (ID, small), `c-sub` (name with sub-line), `c-more` (normal text), `c-amt` (right-aligned number), `c-status` (badge aligned right), `c-act` (actions, 170 px).
- Toolbar above the table: search box, filter chips, Download button (secondary with light blue fill `--sky-bg`, text `--sky`).

### 8.6 Status badges (`.status`)

Inline flex, gap 7 px, padding `5px 12px 5px 10px`, 12 px / 700, nowrap, radius 99 px (classic 8 px). A 7 px dot in `currentColor` with a 3 px soft ring comes before the text.

| Class | Meaning | Colours |
|---|---|---|
| `.s-pending` | pending, planned, waiting | amber |
| `.s-approved`, `.s-paid`, `.s-accepted`, `.s-closed` | approved, onboarded, closed | green |
| `.s-rejected` | rejected, failed | red |
| `.s-clarification`, `.s-review` | clarification, review, With HRMS | sky |
| `.s-draft` | draft, not started | slate |

Use the same set for new modules. Do not invent new status colours.

### 8.7 Headings and page header

- Breadcrumb (`.crumbs`) above the title, 12 px muted, gap 6 px, icon 12 px.
- Page header (`.ph`): title (`h1`) and description, and a right-aligned action area (`.head-actions`) with buttons. On phones the actions take full width.

### 8.8 Icons

- Library: lucide-react, wrapped by `src/shared/ui/icons.tsx`.
- Sizes: 18 px in buttons, 16 px in small buttons and tables, 21 px in the nav, 23–25 px in cards, 32 px in empty states.
- Colour follows `currentColor` (inherit the text colour of the parent).
- Map of names used in the app is in `icons.tsx` (`ICON_NAMES`). Add a name there and map it to a lucide icon.

### 8.9 Empty states

`.empty-state`: padding `44px 20px`, centred, muted. Icon ring `.ring2`: 64 px, radius 22 px, fill `--sky-bg`, icon `--sky` 32 px. Title `strong`: `--font-d` 16 px / 650 / ink. Optional note below.

### 8.10 Notes, errors and info boxes

- `.note` (`Note` component): info panel with an icon and a title; used under headers and in dialogs.
- `.info-box`: radius 20 px (classic 14 px), padding `16px 18px`, gradient `rgba(227,150,138,.2) → rgba(139,108,240,.12)`, border 1 px `--line`.
- `.login-error`: flex, gap 10 px, padding `12px 14px`, radius 12 px, fill `--red-bg`, text `--red`, 13 px / 600, icon 18 px.
- `.warn-text`: `--red`, 600.
- `.helper`, `.required`: section 5.

### 8.11 Dialogs and popovers

- Modal backdrop: fixed, `rgba(5,10,32,.5)`, blur (where the browser supports it), z-index 120, fades in.
- Modal (`.modal`, `Modal` component): radius 22 px, fill `--card-solid`, shadow `--shadow-lg`, body padding `22px 26px 26px`. Title, description, body, action row at the bottom right.
- Popover (`.pop`): fill `--card-solid`, border `--line`, radius 22 px (classic 16 px), shadow `--shadow-lg`, pop-in animation `.18s`. Header `.pop-head` with bottom border; title 15 px / 700.
- Toast (`.toast`, `.snack`): dark pill `#0B1230`, white text, radius 99 px, shadow `--shadow-lg`, bottom centre.

### 8.12 Navigation (shell)

- Nav item: height 44 px, radius 12 px, padding `0 14px`, gap 13 px, weight 550, icon 21 px.
- Hover: fill `--card-2`; icon `--blue` (dark `--blue-2`).
- Active: fill `--grad` with white text and white-tinted icon `#F4C4BB`; dark active: `rgba(222,156,144,.24) → rgba(222,156,144,.08)` with an inset ring `rgba(222,156,144,.3)`.
- Count badge in nav: radius 8 px, min width 22 px, height 20 px.
- Group label: 10.5 px / 700 / uppercase / letter-spacing `.12em` / muted, padding `16px 14px 6px`.
- Mini profile card: radius 14 px, fill `--card-2`, border `--line`.
- Header buttons and role chip: radius 12 px, border `--chrome-line`.

### 8.13 Tooltips and small popups

- Chart tooltip: `#0B1230`, white text, padding `10px 14px`, radius 16 px, border `rgba(255,255,255,.1)`, 12 px.

---

## 9. Dark mode

- Enabled by the `dark` class on `<html>`. The token block for dark mode is in section 2.
- Login-card error box keeps its light colours in dark mode (`#fde7e4` with `#8a0f0f` text).
- Nav active item and icon colours switch to the dark values in section 8.12.
- Page backgrounds: dark uses `--page`; the light rose wash is not used.
- Copper rim: the same gradient in both modes; the fill follows `--card-solid`.
- Test both modes for every new screen.

---

## 10. Accessibility rules used

- Form fields have visible labels; the required marker is `--red`.
- Focus ring: `0 0 0 4px rgba(61,90,241,.16)` with a `--blue` border on inputs; keep a visible focus style on buttons.
- Icon-only buttons have `aria-label`.
- Tab switches use `aria-pressed`; chips use `aria-pressed`.
- Text contrast: ink on card and muted on card are used for all body text; do not place muted text on `--red-bg` or `--sky-bg` at small sizes.
- Dialogs have a title and a description.

---

## 11. How to apply in another module

1. Copy `styles/variant-classic.css`, `styles/components.css`, `styles/shell.css`, `styles/core.css`, `styles/base.css`, and `styles/index.css`. Keep the import order from section 1.
2. Set `data-variant="classic"` on `<html>` in your app's HTML.
3. Install `@fontsource-variable/inter` and `@fontsource-variable/plus-jakarta-sans`, and import both once at startup.
4. Use the class names from section 8 instead of writing new styles. Add new styles only through tokens.
5. Use the status classes in section 8.6 for every status.
6. For new cards and buttons, add the copper rim (section 3) if the module should match the app's look.
7. Keep the breakpoints in section 7.
8. Check light and dark mode, and phone width (380 px and 600 px), before release.

If another application uses Tailwind, the `@theme inline` block in `index.css` maps the tokens to Tailwind colour names. Use those names; do not add new raw hex values.

---

## 12. Known gaps and notes

- `--blur` in dark mode is not set in the classic file; the base file's `backdrop-filter` is used only on cards and the sidebar. Check it when porting.
- Some colours are hard-coded in components (section 2.4). Move them to tokens when you port the code.
- The rose-gold colours are no longer the page background; they remain in `core.css` for the rim gradient.
- Radius values differ between the base file (large, pill-shaped) and the classic variant (flatter). The app uses the classic values. Use the classic values unless you are porting the base style.
- Phone layout turns tables into stacked cards. The `data-label` attribute on cells is needed for the labels to show.
