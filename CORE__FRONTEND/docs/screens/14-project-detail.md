# 14 Project detail (tabs)

Source:
- `src/modules/projects/pages/ProjectDetail.tsx`
- `src/modules/projects/components/GeoFenceTab.tsx`
- `src/modules/projects/components/GeoMap.tsx`
- `src/modules/projects/utils/geo.ts`

## 1. Purpose
One project, in seven tabs:
- **Details**
- **Milestones**
- **WBS**
- **Locations** (assign sites to the project)
- **Geo-fence** (attendance zones)
- **Resource Planning** (read-only summary)
- **Material Planning** (read-only summary)

## 2. Route & access
- Path: `/projects/:id`
- Query: `tab=` one of `Details`, `Milestones`, `WBS`, `Locations`, `Geo-fence`, `Resource Planning` or `Material Planning`.
- Access: Tenant Admin.
- An unknown ID shows "Project not found".

## 3. Data displayed
| Tab | Data |
|---|---|
| Details | code, name, client, start and end dates, status, value, description |
| Milestones | `milestones[]: { id, name, due, weight (%), status: 'Not started' \| 'In progress' \| 'Done' }`, the total weight, and the % done (the sum of weights marked Done) |
| WBS | `wbs[]: { id, code ("1.2.3"), name, parentId }`, shown as a tree |
| Locations | `locationIds` matched to `sites`: code, name, city and state, in-charge |
| Geo-fence | `zones[]: GeoZone` (see below), drawn on an OpenStreetMap or Esri satellite map |
| Resource Planning | `peoplePlan` rows for this project: role, headcount, period, status; total headcount |
| Material Planning | `materialPlan` rows for this project: material, qty, UOM, required by, store, status |

`GeoZone` fields:
- `id`, `label`;
- `type`: `Head Office`, `Mess`, `Store yard`, `Gate` or `Other`;
- `shape`: `Radius`, `Polygon` or `Linear`;
- `centerLat`, `centerLng`, `radiusM`;
- `points: [lat, lng][]`, `bufferM`;
- `version`, `updatedAt`, `updatedBy`.

## 4. User actions
| Tab | Control | Effect |
|---|---|---|
| Header | Back | Goes to `/projects`. |
| Details | Edit, then Save changes | `saveProject`. Shows "Project saved". |
| Milestones | Add, Edit | A dialog form. `saveProject` with the updated `milestones`. Shows "Milestone added" or "Milestone saved". |
| Milestones | Remove | Removes it at once. Shows "Milestone removed". |
| WBS | Add WBS item | A dialog. Shows "WBS <code> added". |
| WBS | Remove | Only if the item has no children. Otherwise: "Remove its child items first." |
| Locations | Choose a location, then Assign | Adds it to `locationIds`. Shows "Location assigned". |
| Locations | Remove | Takes it out of `locationIds`. Shows "Location removed". |
| Geo-fence | Pick a zone | Highlights it on the map. |
| Geo-fence | Add zone, or Edit | Opens the editor (see 5). Save asks for **step-up**, then `saveZone`. Shows "Geo-fence saved as vN". |
| Geo-fence | Delete zone | Asks for **step-up**, then `deleteZone`. Shows "Zone "<label>" deleted". Cancelling shows "Zone not deleted: verification cancelled". |
| Geo-fence editor | Street or satellite, fit map, click to drop a pin, undo last pin, clear, paste points as text, set centre, radius or width slider | Changes the draft only. |
| Resource and Material Planning | Open planning | Goes to `/people-planning` or `/material-planning`. |

## 5. Forms & validation
**Project (Details):** the same rules as [13 New project](13-project-new.md).

**Milestone**
| Field | Rule and message |
|---|---|
| name | required: "Milestone is required." |
| due | required: "Pick a due date." |
| weight | 1 to 100, and the total of all milestones may not pass 100%: "Total would be N%. At most M% is left." |
| status | `Not started`, `In progress` or `Done` |

**WBS item**
| Field | Rule and message |
|---|---|
| parentId | optional |
| code | `^\d+(\.\d+)*$`: "Use numbers separated by dots, e.g. 1.2.3." See below. |
| name | required |

The WBS code must also:
- be unique: "This code already exists.";
- start with the parent's code when there is a parent: "Must start with <parent>.";
- have no dot when there is no parent: "Top-level codes have no dot. Choose a parent."

**Geo-fence zone**
| Field | Rule and message |
|---|---|
| label | required |
| type | one of the five types |
| Radius | a centre is needed: "Click the map or enter the centre point." Radius 50 to 5,000 m. |
| Polygon | at least 3 pins, at most 60. The edges must not cross (`selfIntersects`). |
| Linear | at least 2 pins: "Drop at least 2 pins along the centre line (N so far)." At most 60. Width 5 to 1,000 m on each side. |
| Typed centre | latitude −90 to 90, longitude −180 to 180: "Latitude is −90 to 90 and longitude −180 to 180." |
| Pasted points | one "lat, lng" per line. Bad lines are reported by line number. |

When a zone is saved:
- the centre is rounded to 6 decimals;
- `radiusM` and `bufferM` are 0 when they do not apply;
- `version` goes up by 1.

## 6. Existing API calls
- None to the backend.
- The map loads tiles from `https://tile.openstreetmap.org` and `https://server.arcgisonline.com` (Esri World Imagery).

## 7. Backend requirements (inferred)
**GET `/api/v1/projects/{id}`** returns the full `Project`: milestones, wbs, plan, zones, chainage and locationIds.

**PATCH `/api/v1/projects/{id}`** takes the details fields. 409 `CODE_TAKEN`.

Milestones:
- **POST `/api/v1/projects/{id}/milestones`** with `{ "name", "due", "weight", "status" }`.
- **PUT `/api/v1/projects/{id}/milestones/{milestoneId}`**.
- **DELETE `/api/v1/projects/{id}/milestones/{milestoneId}`**.
- Returns 422 `WEIGHT_OVER_100`.

WBS:
- **POST `/api/v1/projects/{id}/wbs`** with `{ "code": "1.2", "name": "Earthwork", "parentId": "W-1" }`. Returns 409 `CODE_TAKEN` or 422 `BAD_PREFIX`.
- **DELETE `/api/v1/projects/{id}/wbs/{nodeId}`**. Returns 409 `HAS_CHILDREN`.

Locations:
- **POST `/api/v1/projects/{id}/locations`** with `{ "siteId": "S-203" }`.
- **DELETE `/api/v1/projects/{id}/locations/{siteId}`**.

Geo-fence zones (both writes need `X-Step-Up-Token`):
- **POST `/api/v1/projects/{id}/zones`**
  ```json
  { "label": "Main location", "type": "Other", "shape": "Linear", "centerLat": 17.14, "centerLng": 79.6247, "radiusM": 0, "points": [[17.15, 79.57], [17.146, 79.6]], "bufferM": 250 }
  ```
  201 returns the zone with `version`, `updatedAt` and `updatedBy`.
- **PUT `/api/v1/projects/{id}/zones/{zoneId}`** with the same body. Bumps the version.
- **DELETE `/api/v1/projects/{id}/zones/{zoneId}`**.
- Errors: 401 `STEP_UP_REQUIRED`; 422 shape errors (repeat every check above).

Plans: see [19](19-people-planning.md) and [20](20-material-planning.md). This page needs `GET /api/v1/projects/{id}/people-plan` and `GET /api/v1/projects/{id}/material-plan`. Both are named in code TODOs.

## 8. State & side effects
- Audit entries:
  - "Project updated";
  - "Geofence zone added (step-up verified)";
  - "Geofence zone updated (step-up verified)";
  - "Geofence zone deleted (step-up verified)".
- Milestones, WBS and locations are saved as a whole-project update today. One endpoint per item avoids lost updates.
- Geo-fence changes affect attendance in HRMS: HRMS must get the new zones **(inferred)**.
- The empty state "No WBS yet". The note "Attendance needs a geo-fence" shows when there are no zones.

## 9. Navigation
- From: [12 Projects](12-projects.md), [13 New project](13-project-new.md), [18 Geofences](18-geofences.md).
- To: [19 Resource planning](19-people-planning.md), [20 Material planning](20-material-planning.md), [12 Projects](12-projects.md).

## 10. Open questions
- Can a location belong to more than one project? The UI allows it.
- Can a project with locations, stores or requests be deleted? The UI has no delete.
- Chainage markers are edited on the location page ([17](17-location-detail.md)), but they belong to the project. Is that where they should be edited?
- The project `plan` field (`SitePlan`) is not shown on any screen. Is it still needed?
