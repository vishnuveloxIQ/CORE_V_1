# Accessibility audit (CORE-17-04), 21 November 2026

Scope: the signed-in frontend, checked against WCAG 2.1 levels A and AA.

## What was checked, and how

| Check | Tool | Result |
|---|---|---|
| WCAG A/AA rules on 27 screens, as a user with every manage privilege, so create and edit controls are present | axe-core 4.10.3 in the test suite (`src/test/a11y-audit.test.tsx`; contrast excluded, because jsdom does not paint) | No serious or critical violations |
| The same rules, including colour contrast, on 15 screens with server data, in light and dark mode | axe-core 4.10.3 in Chromium (browser pane, local dev server) | **2 defects found and fixed** (below); none left |
| Skip link | Keyboard, Chromium | "Skip to main content" is the first focusable element; its target (`#main`, `tabindex="-1"`) takes focus |
| Visible focus | Keyboard, Chromium | Focused controls show a 2 px solid outline |
| Names on controls | DOM scan, Chromium | No button without an accessible name |
| Dialog focus | Keyboard, Chromium | Focus moves into the dialog, Tab stays inside it, Escape closes it. **Focus did not return to the opener: fixed** (below) |
| Status and errors | Code review | Form errors use `role="alert"` and `aria-describedby`; result counts on filtered lists use `aria-live="polite"` |

## Defects found and fixed

1. **Colour contrast.** The role line under the signed-in user's name in the sidebar had a contrast of 4.45:1; AA needs 4.5:1. It was on every page. It now uses the secondary ink colour (`src/app/styles/shell.css`).
2. **Scrollable table not reachable by keyboard.** Small tables (for example the Bill of Quantities for a user who cannot edit) scroll sideways on a narrow screen but held nothing focusable, so a keyboard user could not scroll them. `MiniTable` is now a focusable, labelled region (`src/shared/ui/Extras.tsx`).
3. **Focus lost after closing a dialog.** Most dialogs are removed from the page as they close, so Radix could not return focus, and keyboard and screen-reader users were sent back to the top of the page. `Modal` now returns focus to the control that opened it (`src/shared/ui/Modal.tsx`). Test: `src/test/modal-focus.test.tsx`.

## Not covered

- **A real screen reader** (NVDA, JAWS or VoiceOver). None is available in this environment. The checks above cover names, roles, labels and focus, which screen readers depend on, but a spoken pass is still needed.
- **Microsoft Edge.** Only Chromium is available here. Edge uses the same engine, so the results should carry over, but it is not tested.
