# Restore drill: tenant acme

- Started: 2026-11-21T14:56:33.024Z
- Result: **PASSED**
- Tables: 62, rows: 2334, dump size: 1188.3 KiB
- Audit chain: source 708 rows (intact), restored 708 rows (intact)
- Restore time (scratch database to verified copy): 2.2 s; whole drill: 7.5 s

| Step | Time |
|---|---|
| Fingerprint the source tenant | 0.40 s |
| Check the source audit chain | 0.06 s |
| Dump the shared reference data | 0.45 s |
| Dump the tenant schema | 0.55 s |
| Create the scratch database | 0.26 s |
| Apply the global migrations | 0.13 s |
| Restore the shared reference data | 0.16 s |
| Restore the tenant schema | 1.45 s |
| Fingerprint the restored copy | 0.17 s |
| Check the restored audit chain | 0.05 s |
| Drop the scratch database | 3.85 s |

## Differences: none
