# 28 Stores

Source: `src/modules/resources/pages/Stores.tsx`

## 1. Purpose
Keeps the store master: code, name, chainage marker, location, address, keeper, phone and status.

## 2. Route & access
- Path: `/stores`
- Access: Tenant Admin.

## 3. Data displayed
`Store` fields:
- `id`, `code`, `name`;
- `chainageId`, `locationId`, `location` (the address);
- `keeper`, `phone`;
- `status`: `Active` or `Inactive`.

| Item | How it is worked out |
|---|---|
| Tiles | stores; material masters; out-of-stock rows; projects served (the distinct projects of the stores' markers) |
| Store / project | `name`, and the project that owns `chainageId` |
| Materials | the number of materials whose `storeIds` include this store |
| Address | `location` |
| Store keeper | `keeper`, `phone` |
| Status | `status` |

Source: `useCore.stores`, `projects`, `materials`, `stock` and `sites`.

## 4. User actions
| Control | Effect |
|---|---|
| New store, Edit, or the code | A dialog form. `saveStore`. Shows "Store created" or "Store saved". |
| Stock | Goes to `/stock?store=<id>`. |
| Bulk upload | `bulkAdd('stores', list)`. |
| Search (code, name, keeper, address), chips, sort, CSV | In the browser (`core-stores.csv`). |

## 5. Forms & validation
| Field | Label | Rule and message |
|---|---|---|
| name | Store name | required |
| code | Store code | 2 to 16 characters, `^[A-Z0-9-]+$`, upper-cased. Unique: "Another store uses this code." |
| chainageId | Chainage marker | required: "Choose the chainage marker." Grouped by project. |
| locationId | Location | required: "Choose the location." Any location (`sites`). |
| location | Address | required: "Address is required." |
| keeper | Store keeper | required |
| phone | Store Keeper Mobile | `^[6-9]\d{9}$`, with a country picker |
| status | Status | `Active` or `Inactive` |

**Bulk upload columns:**
- `code`, `name`;
- `chainage_code`, which must be a known marker ID: "Chainage code <x> is not a known marker.";
- `location` (the address);
- `keeper`, `phone`;
- `status`, which is optional and defaults to Active.

`locationId` is filled from the first location of the marker's project. Codes must be unique against existing stores and within the file.

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
- **GET `/api/v1/stores`**
  ```json
  { "items": [{ "id": "ST-1", "code": "STR-A", "name": "Camp A main store", "chainageId": "CH-1", "locationId": "S-201", "location": "Camp A, near gate 2", "keeper": "Suresh Babu", "phone": "9844400011", "status": "Active", "materialCount": 9 }] }
  ```
- **POST `/api/v1/stores`**, **PUT `/api/v1/stores/{id}`**, **POST `/api/v1/stores/bulk`**.
- Errors:
  - 409 `CODE_TAKEN`;
  - 422 `UNKNOWN_MARKER`, `UNKNOWN_LOCATION`.

## 8. State & side effects
Writes the audit entries "Store created" and "Store updated".

## 9. Navigation
- From: the menu.
- To: [30 Live stock](30-live-stock.md).

## 10. Open questions
- The Location list shows every location, not just the locations of the marker's project. Should the server enforce that they match?
- Should a store with stock be prevented from going Inactive?
