# Building a screen in the VeloxIQ style — one-page brief

**Start from the Layout Kit. Do not recreate the header, sidebar or footer.** They are shared, fixed and already responsive.

![Layout anatomy](screens/layout-anatomy.png)

## The frame (never changes per screen)
| Part | Rule |
|---|---|
| Header | 60 px, white in light **and** dark mode, logo left, search (Ctrl K), theme switch, notifications, account |
| Sidebar | 268 px, collapses to a 78 px icon rail. Click the rail to expand; the X at the top collapses. Becomes a drawer under 900 px |
| Phone (< 900 px) | Sidebar becomes a slim 216 px drawer. A floating **bottom tab bar** shows the first four menu items + "All pages" — put the most-used screens first in `NAV` |
| Content | Max-width 1540 px, 26/30 px padding, grey page background. **Only cards sit on it** |
| Footer | White in both themes, same width as the content column |

## A screen is always
1. `<PageHead crumb title desc actions />` — breadcrumb, big title, one-line description, buttons (max one `primary`).
2. Then, in this order of preference: **stat tiles** (`grid stats`, 4 across) → **chart cards** (`grid dash-grid`, 2/3 + 1/3) → **`TablePanel`** → **`Card`** with a form (`form-grid`, 2 columns).
3. Wrapped in `useEnter(ref, key)` so cards animate in.

## Use only these building blocks
`Button` · `Card` · `StatTile` · `StatusBadge` · `FormGroup` + `Input/Select/Textarea/CheckRow` · `TablePanel` · `Modal` · `EmptyState` · `Avatar/Who` · `TrendChart` · `DonutCard` · `notify()` toast · `Icon` (Lucide, add via `src/theme/icons.tsx`).
Live examples of every one: run the kit and open **Style guide**.

## Hard rules
- Colours via CSS variables only (`var(--ink)`, `var(--green)`…). No hex, no new fonts, no custom shadows.
- Sentence case. Dates `21 Oct 2026`. Money `₹1,34,700`. Status words = the five tones (pending, approved, rejected, review, draft).
- Tables: always `TablePanel` (it turns into cards on phones). Give each column a `kind` (`c-id`, `c-sub`, `c-amt`, `c-status`, `c-more`).
- Every form field goes through `FormGroup` (label, required star, helper, error).
- Test in light, dark and a 390 px wide window before sharing.

## Add a screen in 3 steps
1. Copy `src/pages/BlankScreen.tsx` → `src/pages/YourScreen.tsx`.
2. Register it in `src/routes.tsx`.
3. Add its menu entry in `src/config/app.ts` (label, path, icon).

## Reviewer checklist
- [ ] Header, sidebar, footer untouched
- [ ] Starts with PageHead; one primary button
- [ ] Only shared components, no hard-coded colours
- [ ] Dark mode looks right; no horizontal scroll at 390 px
- [ ] Tables via TablePanel; forms via FormGroup
