# 01 Home (public landing)

Source: `src/modules/auth/pages/Home.tsx`, `src/modules/auth/components/PublicNav.tsx`

## 1. Purpose
The public landing page for VeloxIQ. It introduces the product and sends visitors to register a company or sign in.

## 2. Route & access
- Path: `/`. The app uses a hash router, so the address is `#/`.
- Access: public. A signed-in user is redirected to `/dashboard`.
- No params.

## 3. Data displayed
Static marketing text and a feature list, written in the component. Nothing comes from the store.

## 4. User actions
| Control | Effect |
|---|---|
| Register | Go to `/register`. |
| Sign in | Go to `/login`. With no `role` param, this shows the user login. |
| Logo and public nav links | Go to `/`, `/register` or `/login`. |

## 5. Forms & validation
None.

## 6. Existing API calls
None.

## 7. Backend requirements
None. The page is static.

## 8. State & side effects
Reads `useAuth().user` from session storage to decide whether to redirect.

## 9. Navigation
- From: a direct visit, or sign-out (the header sends the user to `/`).
- To: [03 Register](03-register.md), [02 Login](02-login.md), or [06 Dashboard](06-dashboard.md) when already signed in.

## 10. Open questions
None for this screen.
