# 30 Live stock

Source: `src/modules/resources/pages/LiveStock.tsx`

## 1. Purpose
Shows the current stock per store and material, as Stores publishes it. The page only reads.

## 2. Route & access
- Path: `/stock`
- Query: `store=<storeId>` filters to one store.
- Access: Tenant Admin.

## 3. Data displayed
`StockRow` fields: `id`, `storeId`, `materialId`, `qty` (on hand), `reserved`, `updatedAt`.

| Column | How it is worked out |
|---|---|
| Material | the material's code |
| Material / store | the material's name and the store's name |
| Free | `qty - reserved` |
| On hand | `qty` |
| Reserved | `reserved` |
| Reorder level | `material.reorderLevel` |
| Level | Out of Stock, Low Stock or Available Stock. See below. |

The level is:
- **Out of Stock** when `qty === 0`;
- **Low Stock** when free stock is below the reorder level **(inferred, same rule as the dashboard)**;
- **Available Stock** otherwise.

The page also shows the time of the latest update. The note "Stock publishing API not specified yet" says the figures are sample data.

## 4. User actions
| Control | Effect |
|---|---|
| Show stock for (store) | Sets or clears `?store=`. |
| Material requests | Goes to `/approvals?category=Equipment+and+material`. |
| Search, chips (level), sort, CSV | In the browser (`core-live-stock.csv`). |

## 5. Forms & validation
None.

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
**GET `/api/v1/stock?storeId=ST-1`**
```json
{ "items": [{ "id": "SR-1", "storeId": "ST-1", "materialId": "M-1", "qty": 420, "reserved": 100, "updatedAt": "2026-11-06T09:15:00" }], "latestUpdate": "2026-11-06T09:15:00" }
```

**Inbound from Stores:** **PUT `/api/v1/integrations/stores/stock`**, with a batch of `{ storeId, materialId, qty, reserved, updatedAt }`. Machine-to-machine auth. PRD §5 leaves the stock publishing API open.

## 8. State & side effects
Stock changes in the Stores module. Refresh it on page open and on a timer, or push it **(inferred)**.

## 9. Navigation
- From: the menu, [28 Stores](28-stores.md) (`?store=`).
- To: [25 Approvals](25-approvals-list.md).

## 10. Open questions
- What is the stock publishing contract with Stores: push or pull, and how often?
