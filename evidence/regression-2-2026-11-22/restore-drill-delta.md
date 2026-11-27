# Restore drill: tenant delta

- Started: 2026-11-22T12:26:02.893Z
- Result: **PASSED**
- Tables: 65, rows: 130, dump size: 237.8 KiB
- Audit chain: source 7 rows (intact), restored 7 rows (intact)
- Restore time (scratch database to verified copy): 1.2 s; whole drill: 1.9 s

| Step | Time |
|---|---|
| Fingerprint the source tenant | 0.17 s |
| Check the source audit chain | 0.00 s |
| Dump the shared reference data | 0.18 s |
| Dump the tenant schema | 0.25 s |
| Create the scratch database | 0.18 s |
| Apply the global migrations | 0.09 s |
| Restore the shared reference data | 0.09 s |
| Restore the tenant schema | 0.80 s |
| Fingerprint the restored copy | 0.06 s |
| Check the restored audit chain | 0.00 s |
| Drop the scratch database | 0.12 s |

## Differences: none
