# 11 Custom policy (one admin-defined policy)

Source: `src/modules/company/pages/CustomPolicy.tsx`, `src/modules/company/components/CustomPolicyEditor.tsx`

## 1. Purpose
Shows one custom policy that the admin defined: its fields, the values in force, and its versions. A new version can be saved with new values.

## 2. Route & access
- Path: `/policies/custom/:id`
- Access: Tenant Admin.
- An unknown ID shows "Custom policy" with "That policy does not exist or was removed."

## 3. Data displayed
| Item | Source |
|---|---|
| name, description, fields[] (`id`, `label`, `type`, `required`, `options`) | `customPolicies` |
| The version in force: version, effectiveFrom, createdBy, reason, values | `customVersions` through `customPolicyState` |
| All versions | `customVersions` |

`values` is a `Record<fieldId, string | number | boolean>`.

## 4. User actions
| Control | Effect |
|---|---|
| All policies | Goes to `/policies`. |
| New version, or Edit as new version | Opens the values form, starting from the latest values. |
| Save | `addCustomVersion(id, effectiveFrom, reason, values)`. Shows "<name>: vN saved, effective <date>". |
| Back or Cancel | Closes the form without saving. |

## 5. Forms & validation
- `effectiveFrom`: today or later.
- `reason`: at least 10 characters.
- Each field, by its type:

| Type | Input | Check | Message |
|---|---|---|---|
| text | text | if required: not empty | "<label> is required." |
| longtext | textarea | if required: not empty | "<label> is required." |
| number | number | a finite number | "Enter a valid number." |
| date | date | `yyyy-MM-dd` | "Pick a valid date." |
| yesno | toggle | none (always a boolean) | — |
| select | select | one of the options | "Pick one of the choices." |

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
**GET `/api/v1/custom-policies/{id}`** returns the definition and its versions.
```json
{ "id": "...", "name": "Site PPE", "description": "...", "fields": [{ "id": "f1", "label": "Helmet colour", "type": "select", "required": true, "options": ["White", "Yellow"] }], "createdBy": "Anil Mehta", "createdAt": "...",
  "versions": [{ "id": "...-v1", "policyId": "...", "version": 1, "effectiveFrom": "2026-12-01", "reason": "...", "createdBy": "...", "createdAt": "...", "values": { "f1": "White" } }] }
```
**POST `/api/v1/custom-policies/{id}/versions`** with `{ "effectiveFrom": "...", "reason": "...", "values": { "f1": "Yellow" } }`.
- 201 returns the version.
- 422 returns per-field errors keyed by field ID.
- 404 for an unknown policy.

The server must check the values against the field definitions, using the same rules as above.

## 8. State & side effects
Writes the audit entry "New policy version vN".

## 9. Navigation
- From: [09 Policies](09-policies.md).
- To: [09 Policies](09-policies.md).

## 10. Open questions
- Do other modules read custom policies? If so, by policy name or by ID?
