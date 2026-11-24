# 29 Materials (material master)

Source: `src/modules/resources/pages/Materials.tsx`

## 1. Purpose
Keeps the material master that Stores owns, and controls which stores each material is available in.

## 2. Route & access
- Path: `/materials`
- Access: Tenant Admin.

## 3. Data displayed
`Material` fields:
- `id`, `code`, `name`;
- `category`, `uom`, `hsn`;
- `reorderLevel`, `storeIds[]`;
- `status`.

Tiles: material masters, categories, materials with stock above 0, inactive materials.

Columns: code; material and unit; stores (count); category; reorder level; status.

## 4. User actions
| Control | Effect |
|---|---|
| New material, Edit, or the code | A dialog form. `saveMaterial`. Shows "Material created" or "Material saved". |
| Bulk upload | `bulkAdd('materials', list)`. |
| Search (code, name, category, HSN), chips, sort, CSV | In the browser (`core-materials.csv`). |

## 5. Forms & validation
| Field | Rule and message |
|---|---|
| name | required |
| code | 2 to 16 characters, `^[A-Z0-9-]+$`. Unique: "Another material uses this code." |
| hsn | `^\d{4,8}$`: "HSN is 4 to 8 digits." |
| category | one of the categories below |
| uom | one of the units below |
| reorderLevel | a number, at least 0 |
| storeIds | at least 1: "Make it available to at least one store." |
| status | `Active` or `Inactive` |

Categories:
- Cement, Steel, Aggregates, Sand, Bitumen, Fuel, Admixtures
- Formwork, Electrical, Plumbing, Safety, Consumables, Paint, Other

Units: Bag (50 kg), MT, Kg, Cum, Sqm, Rmt, Litre, Nos, Set.

**Bulk upload columns:** `code`, `name`, `category`, `uom`, `hsn`, `reorder_level`, `store_codes` (separated by `;` or `,` **(inferred)**), `status`.

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
- **GET `/api/v1/materials`**
  ```json
  { "items": [{ "id": "M-1", "code": "CEM-OPC53", "name": "OPC 53 cement", "category": "Cement", "uom": "Bag (50 kg)", "hsn": "2523", "reorderLevel": 200, "storeIds": ["ST-1", "ST-2"], "status": "Active" }] }
  ```
- **POST `/api/v1/materials`**, **PUT `/api/v1/materials/{id}`**, **POST `/api/v1/materials/bulk`**.
- **GET `/api/v1/materials/categories`** and **GET `/api/v1/materials/uoms`**, if these lists become master data **(inferred)**.
- Errors: 409 `CODE_TAKEN`; 422 `UNKNOWN_STORE`.

## 8. State & side effects
Writes the audit entries "Material master created" and "Material master updated".

## 9. Navigation
- From: the menu.
- To: none.

## 10. Open questions
- Are the categories and units fixed lists, or editable master data?
- Removing a store from `storeIds` while that store still holds stock: allowed?
