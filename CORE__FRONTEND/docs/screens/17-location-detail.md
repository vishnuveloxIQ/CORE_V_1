# 17 Location detail (details and chainage)

Source: `src/modules/projects/pages/SiteDetail.tsx`

## 1. Purpose
One location, in two tabs:
- **Details**: its own fields, which can be edited.
- **Chainage**: the km range and chainage markers of a chosen project. Stores, equipment and requests point at these markers.

## 2. Route & access
- Path: `/sites/:id`
- Query:
  - `tab=Details` or `tab=Chainage`;
  - `project=<projectId>` picks which project's chainage to show;
  - `edit=` opens a tab in edit mode **(inferred from `go(tab, edit, project)`)**.
- Access: Tenant Admin.
- An unknown ID shows "Location not found".

## 3. Data displayed
| Tab | Data |
|---|---|
| Details | code, name, addressLine, city, state, pin, inCharge, phone, email, status |
| Chainage | the project picker, and `project.chainage = { startKm, endKm, markers: [{ id, km, label, wbsCode }] }` |

The Chainage tab shows the empty state "No project yet" when there are no projects.

## 4. User actions
| Control | Effect |
|---|---|
| Edit (Details), then Save | `saveSite`. Shows "Location saved". |
| Project picker (Chainage) | Changes the project shown. |
| Edit chainage | Opens the marker and range editor. |
| Add marker | Adds a marker to `project.chainage.markers` through `saveProject`. Shows "Marker added at <km>". |
| Remove marker | Shows a toast and saves at once. |
| Save range | Sets `startKm` and `endKm`. Shows "Chainage set to <a> – <b>". |
| Bulk upload (markers) | A CSV with `km`, `label` and `wbs_code`. |
| Done editing | Leaves edit mode. Every change was already saved. |

## 5. Forms & validation
**Details:** the same rules as [16 New location](16-location-new.md).

**Marker**
| Field | Rule and message |
|---|---|
| km | a number: "Enter the km." It must be inside the range: "Must be within <start> – <end>." No two markers at the same km: "A marker already exists at this km." |
| label | required |
| wbsCode | optional; one of the project's WBS codes |

**Range**
- startKm and endKm: at least 0.
- endKm must be greater than startKm: "End km must be greater than start km."
- No marker may fall outside the new range: "N marker(s) fall outside this range. Remove them first."

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
- **GET `/api/v1/sites/{id}`** returns the `Site`.
- **PUT `/api/v1/sites/{id}`** takes the site fields. 409 `CODE_TAKEN`.
- **GET `/api/v1/projects/{id}/chainage`** returns `{ "startKm": 0, "endKm": 48.5, "markers": [{ "id": "CH-1", "km": 12.5, "label": "Camp A", "wbsCode": "1.1" }] }`.
- **PUT `/api/v1/projects/{id}/chainage/range`** with `{ "startKm": 0, "endKm": 50 }`. 422 `MARKERS_OUTSIDE_RANGE`.
- **POST `/api/v1/projects/{id}/chainage/markers`** with `{ "km": 14, "label": "Bridge 3", "wbsCode": "" }`. 201 returns the marker with a server ID. 409 `KM_TAKEN`. 422 `OUT_OF_RANGE`.
- **DELETE `/api/v1/projects/{id}/chainage/markers/{markerId}`**. Returns 409 `MARKER_IN_USE` if a store, unit, assignment or request points at it **(inferred)**.
- **POST `/api/v1/projects/{id}/chainage/markers/bulk`**.

## 8. State & side effects
- Writes the audit entries "Location updated" and "Project updated" (for chainage changes).
- Marker IDs (`CH-n`) are referenced by stores, units, requests and assignments.

## 9. Navigation
- From: [15 Locations](15-locations.md), [16 New location](16-location-new.md).
- To: [15 Locations](15-locations.md).

## 10. Open questions
- Can a marker that stores or requests use be removed? The UI removes it without checking.
- Chainage belongs to the project, but it is edited from a location page. Should it move to the project page?
