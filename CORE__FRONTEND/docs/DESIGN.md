# Design reference — VeloxIQ Classic

All tokens live in `src/styles/variant-classic.css` (light on `html[data-variant="classic"]`, dark on `html.dark[data-variant="classic"]`). Change a value there and the whole app follows; Tailwind utilities read the same variables (`@theme inline` in `src/index.css`).

## Colour
| Token | Light | Dark | Use |
|---|---|---|---|
| `--navy` | `#062258` | same | Brand navy, primary buttons, active nav |
| `--blue` | `#123C94` | same | Primary gradient start, links |
| `--rose-d` | `#C27D70` | same | Accent line, dark-mode primary |
| `--page` | `#F2F4FA` | `#070D1F` | Page background |
| `--card-solid` | `#FFFFFF` | `#0F1830` | Cards, sidebar |
| `--ink` / `--ink-2` / `--muted` | `#0C1A3D` / `#37446A` / `#68738F` | `#EDF0FA` / `#C5CDE6` / `#93A0C6` | Text |
| `--line` | `#E3E7F1` | `#22305A` | Borders |
| `--green` / `--amber` / `--red` / `--sky` | `#12775A` / `#8F5B0E` / `#B03535` / `#2A56BE` | `#58D6A2` / `#F0C06A` / `#F08E8B` / `#8EAEFA` | Status text (each has a `-bg` tint) |
| `--chrome` | `#FFFFFF` | `#FFFFFF` | **Header and footer — white in both themes by design** |

## Type
- Body: **Inter Variable**. Headings: **Plus Jakarta Sans Variable** (both self-hosted via `@fontsource-variable`, no CDN).

## Shape and depth
- Radius: cards `18px`, controls `12px`, pills `99px`. Shadows: `--shadow`, `--shadow-lg`.

## Layout
- Header 60 px; sidebar 268 px, collapsing to a 78 px icon rail. Click the rail to expand; **X** at the top of the sidebar collapses it. State persists in `localStorage`.
- Breakpoints: `1380` (dashboard grid), `1100` (header compacts), `899` (sidebar becomes a drawer), `700`/`600` (phone spacing). Tables become cards under `899 px`.

## Icons
- **Lucide** (outline, 1.9 stroke), mapped by semantic name in `src/theme/icons.tsx`. Add an icon: add its name to `ICON_NAMES` and map it in `ICONS`, both in `src/theme/icons.tsx`.

## Logo files (`assets/logo/`)
- `veloxiq-logo.svg` (source, used in header/footer), PNGs at 1×/2×/4× with transparent background. The app imports `src/assets/veloxiq-logo.svg`; the favicon is `public/veloxiq-logo.svg`.

## Motion
- GSAP: page entrance stagger (`useEnter`), count-up numbers (`AnimatedValue`), chart line draw. All respect `prefers-reduced-motion`.
