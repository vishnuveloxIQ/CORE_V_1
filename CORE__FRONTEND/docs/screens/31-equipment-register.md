# 31 Company equipment register (with the registration wizard)

Source: `src/modules/resources/pages/EquipmentRegister.tsx`

## 1. Purpose
Lists the company's equipment units with their current project and availability. New units are registered with a four-step wizard or in bulk. Any unit's details open in a dialog.

## 2. Route & access
- Path: `/equipment/register`
- Access: Tenant Admin. The page says registration is maintained by P&M.

## 3. Data displayed
**`EquipmentUnit` fields:**

| Group | Fields |
|---|---|
| Identity | `id`, `assetCode`, `name`, `type`, `makeModel`, `regNo`, `ownershipType` |
| Position | `chainageId`, `lat`, `lng`, `lastPing` |
| State | `availability`: `Available`, `In use`, `Under maintenance` or `Breakdown` |
| Technical | `manufacturer`, `model`, `mfgYear`, `chasisNo`, `engineNo`, `capacity`, `capacityUnit`, `meterType`, `meterReading`, `fuelType`, `fuelNorm`, `tankCapacity` |
| Papers | `invoiceNo`, `invoiceDate`, `insuranceNo`, `insuranceExpiry`, `pucNo`, `pollutionExpiry`, `regExpiry`, `fitnessCert`, `fitnessExpiry` |
| Ownership | `owner`, `vendorId`, `hireRef`, `agreementStart`, `agreementEnd`, `warrantyEnd`, `warrantyReading`, `currentLocation` |

Tiles: count per availability.

Columns:
- S No, equipment name, made (`makeModel`), company code (`assetCode`);
- current project (the project of `chainageId`);
- current status.

## 4. User actions
| Control | Effect |
|---|---|
| Show project | Filters. |
| Add equipment | Opens the wizard in place of the list. |
| Wizard: Continue, Back, step badges | Moves between steps. Continue first checks the current step's fields. |
| Wizard: Take photo or Upload file (machine photo and six document tiles) | Uses the camera (`getUserMedia`) or a file picker. If the camera is blocked: "Camera access was blocked or no camera was found…" |
| Wizard: Register equipment | Adds one unit with `bulkAdd('units', [unit])`. See below. |
| Details | Opens a dialog with every field of the unit. |
| Bulk upload | `bulkAdd('units', list)`. |
| Search (asset, name, type, registration), chips, sort, CSV | In the browser (`core-equipment-register.csv`). |

When a unit is registered:
- `chainageId` is the first marker of the chosen project;
- `availability` is taken from the form.

## 5. Forms & validation
Wizard steps:
1. Identity
2. Technical
3. Ownership & location
4. Review & save

| Step | Field | Rule and message |
|---|---|---|
| 1 | assetCode | required. Unique: "Equipment ID <x> is already registered." |
| 1 | name | required |
| 1 | type | required: "Choose one of the equipment categories." One of `EQUIPMENT_TYPES` (Excavator, Bulldozer, … 27 or more types). |
| 1 | ownershipType | required: "Choose Owned or Hired." |
| 1 | regNo | optional |
| 1 | availability | required |
| 2 | manufacturer, model, chasisNo, engineNo, capacityUnit, fuelType | required |
| 2 | mfgYear | a four-digit year |
| 2 | capacity, meterReading | numbers, required |
| 2 | fuelNorm, tankCapacity | numbers, optional |
| 2 | invoice, insurance, PUC, registration and fitness numbers and dates | optional. Dates are `yyyy-MM-dd`. |
| 2 | meterPhoto | required. The other photos and documents are optional. |
| 3 | projectId | required: "Choose the project this equipment belongs to." The project must have a marker: "The project has no chainage marker to link the unit to." |
| 3 | owner | required. One of: Company, Hire vendor, Sai Earthmovers. |
| 3 | hireRef | required |
| 3 | agreementStart, agreementEnd | required dates |
| 3 | warrantyEnd, warrantyReading | optional |
| 3 | currentLocation | required. One of the project's marker labels. |

The meter type is fixed as "HMR — running hours".

The photos and documents are checked but **not saved** on the unit today.

**Bulk upload columns:**
- `asset_code`, `equipment_name`, `equipment_type`, `reg_no`;
- `ownership_type`, `project_code`, `availability`;
- the 27 document columns, such as `manufacturer`, `model`, `mfg_year`, `chasis_no`, …, `current_location`.

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
- **GET `/api/v1/equipment/units?projectId=&type=&availability=`** returns `{ "items": [EquipmentUnit] }`.
- **GET `/api/v1/equipment/units/{id}`**.
- **POST `/api/v1/equipment/units`** (multipart: JSON `unit` plus the files `machinePhoto`, `chasisPhoto`, `enginePhoto`, `meterPhoto`, `invoiceDoc`, `insuranceDoc` and `pucDoc`).
  ```json
  { "assetCode": "EXC-020", "name": "Excavator EX-20", "type": "Excavator", "regNo": "TS09EX1402", "ownershipType": "Owned", "projectId": "P-101", "availability": "Available",
    "manufacturer": "Tata Hitachi", "model": "EX210", "mfgYear": "2019", "chasisNo": "CH781120", "engineNo": "ENG-44812", "capacity": "21", "capacityUnit": "kVA",
    "meterReading": "4200", "fuelType": "Diesel", "owner": "Company", "hireRef": "HR-2291", "agreementStart": "2026-01-01", "agreementEnd": "2026-12-31", "currentLocation": "Camp A" }
  ```
  - 201 returns `EquipmentUnit` with file IDs.
  - Errors: 409 `ASSET_CODE_TAKEN`; 422 `PROJECT_HAS_NO_MARKER`.
- **POST `/api/v1/equipment/units/bulk`**.
- **GET `/api/v1/equipment/types`** returns the type master (`EquipmentTypeMaster`: code, name, meterKind, fuelNormUnit).
- **GET `/api/v1/vendors`** returns the hire vendors, for the owner list.

## 8. State & side effects
- Writes the audit entry "Bulk upload: N equipment unit records added", for a single unit too.
- Uses file storage for the photos and documents.
- Uses the camera in the browser.
- GPS fields (`lat`, `lng`, `lastPing`) are filled by a future GPS feed, in Release 2.

## 9. Navigation
- From: the menu.
- To: none.

## 10. Open questions
- The owner list is hard-coded (Company, Hire vendor, Sai Earthmovers). Should it come from `core_vendor`?
- `ownershipType` "Owned" with owner "Company": should the hire fields then be optional? Today they are always required.
- Should the photos and documents be stored? Today they are not.
- Can units be edited or retired? There is no edit in the UI.
