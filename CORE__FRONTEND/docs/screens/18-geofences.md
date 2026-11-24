# 18 Geofences

Source: `src/modules/projects/pages/Geofences.tsx`, which reuses `GeoFenceTab`.

## 1. Purpose
One place to review and edit the geo-fence zones of every project: a list of projects on the left, and the chosen project's map and zones on the right.

## 2. Route & access
- Path: `/geofences`
- Access: Tenant Admin.

## 3. Data displayed
- The project list: name, code, and number of zones.
- For the chosen project, the same zone data as the Geo-fence tab of [14 Project detail](14-project-detail.md).

## 4. User actions
| Control | Effect |
|---|---|
| Pick a project | Shows its zones and leaves edit mode. |
| Add, edit or delete a zone | The same as the Geo-fence tab in [14](14-project-detail.md), including step-up. |

## 5. Forms & validation
The same as the zone editor in [14](14-project-detail.md).

## 6. Existing API calls
None. Map tiles come from OpenStreetMap and Esri.

## 7. Backend requirements (inferred)
- **GET `/api/v1/projects?include=zones`**, or `GET /api/v1/projects/{id}/zones` for each project.
- The zone write endpoints are in [14](14-project-detail.md).

## 8. State & side effects
The same audit entries and step-up as [14](14-project-detail.md).

## 9. Navigation
- From: the menu, and the "has no geo-fence" notification.
- To: none.

## 10. Open questions
None beyond [14](14-project-detail.md).
