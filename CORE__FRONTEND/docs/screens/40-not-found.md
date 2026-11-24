# 40 Not found (404)

Source: `src/app/pages/NotFound.tsx`

## 1. Purpose
Shown for any unknown path inside the signed-in app.

## 2. Route & access
- Path: `*` inside the protected shell.
- Access: signed in. A signed-out user is sent to login first.

## 3. Data displayed
"Page not found. That address doesn't exist in this module."

## 4. User actions
| Control | Effect |
|---|---|
| Back to dashboard | Goes to `/dashboard`. |

## 5. Forms & validation
None.

## 6. Existing API calls
None.

## 7. Backend requirements
None.

## 8. State & side effects
None.

## 9. Navigation
- From: any unknown path.
- To: [06 Dashboard](06-dashboard.md).

## 10. Open questions
None.

Note: detail pages show their own "not found" state for unknown IDs, for example "Project not found". With a backend, these come from a 404 response.
