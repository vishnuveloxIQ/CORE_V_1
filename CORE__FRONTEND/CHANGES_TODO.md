# CHANGES_TODO

Status: [ ] todo, [x] done, [~] partial, [!] blocked

## A. Global UI
- [ ] 1 Select chevron everywhere
- [ ] 2 Input placeholders
- [ ] 3 Page subtitles (a punctuation, b wording, c alignment, d Projects/Sites/Milestones)

## B. Planning
- [ ] 4 People Planning
- [ ] 5 Material Planning

## C. Sites & geofences
- [ ] 6 Multiple named geofences per site
- [ ] 7 "No geofence" card state
- [ ] 8 Geofences page layout

## D. Approvals
- [ ] 9 Cash-limit approval matrix
- [ ] 10 Approvers "Rejected" filter

## E. Subscription
- [ ] 11 Contact Support / Upgrade Plan modals
- [ ] 12 Subscription layout
- [ ] 13 Remove invoice All/Paid filter

## F. Attendance
- [ ] 14 Week-off pattern

## G. Stores & materials
- [ ] 15 Shop Keeper Mobile
- [ ] 16 Material status labels

## H. HR
- [ ] 17 Offer letter full-screen preview
- [ ] 18 Organogram Fit to Screen
- [ ] 19 Department colour

## I. Messages
- [ ] 20 Reset-password message
- [ ] 21 Revoke-access message

## Status note (latest session)
- Verified by tests/build: vitest 45/45, `tsc -b` + `vite build` pass, eslint 0 errors (8 fast-refresh warnings).
- Done in code, NOT browser-verified (admin login needs a password; not entered): project "kind" removal; Users and roles People | Roles tabs.
- Not started/unverified: items above remain unticked because they were not individually re-verified. Open: CompanyProfile GSTIN/CIN/TAN hard-lock, PMS limits page + route, dropdown/placeholder CSS sweep, unused `flagOf`.
