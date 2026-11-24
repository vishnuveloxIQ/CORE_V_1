# 13 New project

Source: `src/modules/projects/pages/ProjectNew.tsx`, `src/modules/projects/components/ProjectForm.tsx`, `src/modules/projects/utils/project/schema.ts`

## 1. Purpose
Creates a project. Milestones, WBS, locations, the geo-fence and planning are added after saving, on the project page.

## 2. Route & access
- Path: `/projects/new`
- Access: Tenant Admin.

## 3. Data displayed
An empty form. It uses `useCore.projects` to check that the code is unique.

## 4. User actions
| Control | Effect |
|---|---|
| Create project | `saveProject(project)`. Shows "Project created" and goes to `/projects/:id`. |
| Cancel, or Back to projects | Goes to `/projects`. |

## 5. Forms & validation
| Field | Type | Required | Rule and message |
|---|---|---|---|
| code | text, upper-case | yes | 2 to 16 characters, `^[A-Z0-9-]+$`: "Use capitals, digits and hyphens only." Unique: "Another project uses this code." |
| name | text | yes | "Project name is required." |
| client | text | yes | "Client is required." |
| startDate | date | yes | "Pick a start date." |
| endDate | date | yes | "Pick an end date." Must be after the start: "End date must be after the start date." |
| status | select | yes | `Planning`, `Active`, `On hold` or `Completed` |
| value | number | yes | at least 0: "Enter contract value." |
| description | textarea | no | at most 500: "Keep it under 500 characters." |

The ID is built in the browser as `P-<max+1>`. New projects start with:
- empty `milestones`, `wbs`, `zones` and `locationIds`;
- a `plan` with empty fields;
- chainage `{ 0, 0, [] }`.

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
**POST `/api/v1/projects`**
```json
{ "code": "MTR-DEP", "name": "Metro depot", "client": "HMRL", "startDate": "2026-01-10", "endDate": "2027-06-30", "status": "Planning", "value": 950000000, "description": "" }
```
- 201 returns the full `Project` with the ID assigned by the server.
- 409 `CODE_TAKEN`.
- 422 returns field errors.

## 8. State & side effects
Writes the audit entry "Project created".

## 9. Navigation
- From: [12 Projects](12-projects.md).
- To: [14 Project detail](14-project-detail.md), [12 Projects](12-projects.md).

## 10. Open questions
None beyond server-side IDs.
