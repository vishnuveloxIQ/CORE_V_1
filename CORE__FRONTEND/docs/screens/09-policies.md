# 09 Policies (list, pick a policy, create a custom policy)

Source:
- `src/modules/company/pages/Policies.tsx`
- `src/modules/company/utils/meta.ts`
- `src/modules/company/components/CustomPolicyEditor.tsx` (the create form)

## 1. Purpose
Lists the six built-in company policies, plus any custom policies the admin has defined, with their full version history. Every change is a new version with an effective date, so past payroll and attendance never change.

## 2. Route & access
- Path: `/policies`
- Access: Tenant Admin.

## 3. Data displayed
**Built-in policies** (`PolicyKey`):

| Key | Title |
|---|---|
| `rules` | Rules and regulations |
| `payment-threshold` | Payment threshold |
| `holidays` | Holiday policy |
| `shifts` | Shift count |
| `leave` | Leave policy |
| `overtime` | Overtime policy |

For each built-in policy, the card shows the version in force, a one-line summary (`summarize`), and any scheduled version.

**Custom policies.** Each card shows:
- `CustomPolicyDef`: `name`, `description`, and `fields[]`;
- its current `CustomPolicyVersion`.

**Version history table.** One row per version of every policy:
- policy, version, change (the reason), effective from, and by;
- state: In force, Scheduled or Superseded.

Sources: `useCore.policies`, `customPolicies` and `customVersions`.

## 4. User actions
| Control | Effect |
|---|---|
| New custom policy | Opens the create form. See below. |
| Change a policy | Opens "Which policy is changing?". Picking one goes to `/policies/<key>?edit=1`. |
| Open (policy card) | `/policies/<key>`, or `/policies/custom/<id>`. |
| Policy name in the table | Opens that policy. |
| Table search, chips, sort and CSV export | In the browser (`core-policy-versions.csv`). |

Saving the create form calls `createCustomPolicy(def, firstVersion)`, shows a toast, and goes to `/policies/custom/<id>`.

## 5. Forms & validation
**Create custom policy: definition**

| Field | Required | Rule and message |
|---|---|---|
| name | yes | at most 60: "Policy name is required." / "Keep the name under 60 characters." |
| description | yes | at most 400: "Keep it under 400 characters." |
| fields[] | at least 1 | "Add at least one field." |
| fields[].label | yes | at most 60. Labels must be different: "Field names must be different." |
| fields[].type | yes | `text`, `longtext`, `number`, `date`, `yesno` or `select` |
| fields[].required | — | boolean |
| fields[].options | select only | comma-separated, at least 2: "Give at least two choices, separated by commas." |

**Create custom policy: first version.** The effective-from date and reason follow the shared version rules:
- effectiveFrom: "Pick the date this version applies from." It must be today or later: "Must be today or later. Past payroll and attendance never change."
- reason: at least 10 characters: "Give a reason of at least 10 characters."

The first version also has a value for each field. See [11 Custom policy](11-custom-policy.md).

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
**GET `/api/v1/policies`**
```json
{
  "builtIn": [{ "key": "overtime", "current": { "id": "overtime-v2", "version": 2, "effectiveFrom": "2026-04-01", "reason": "...", "createdBy": "Anil Mehta", "createdAt": "...", "data": { } }, "scheduled": [], "latestVersion": 2 }],
  "custom": [{ "id": "c1a...", "name": "Site PPE", "description": "...", "fields": [], "createdBy": "...", "createdAt": "...", "current": { } }]
}
```
**GET `/api/v1/policies/versions`** returns every version of every policy, for the history table.

**POST `/api/v1/custom-policies`**
```json
{
  "name": "Site PPE", "description": "PPE each person must wear",
  "fields": [{ "id": "f1", "label": "Helmet colour", "type": "select", "required": true, "options": ["White", "Yellow"] }],
  "firstVersion": { "effectiveFrom": "2026-12-01", "reason": "First version of the PPE rules", "values": { "f1": "White" } }
}
```
- 201 returns `{ "id": "...", "versionId": "...-v1" }`.
- 409 `NAME_TAKEN` **(inferred)**.
- 422 returns field errors.

## 8. State & side effects
- Writes audit entries: "Custom policy created" and "New policy version vN".
- The state of each version is worked out against today's date.

## 9. Navigation
- From: the menu.
- To: [10 Policy editor](10-policy-editor.md), [11 Custom policy](11-custom-policy.md).

## 10. Open questions
- Can a custom policy be removed, or its fields changed after creation? The UI cannot do either.
- Should a custom policy's name be unique? The UI does not check.
