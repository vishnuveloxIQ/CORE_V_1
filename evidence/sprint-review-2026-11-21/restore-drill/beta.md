# Restore drill: tenant beta

- Started: 2026-11-21T14:56:44.918Z
- Result: **PASSED**
- Tables: 62, rows: 1201, dump size: 374.4 KiB
- Audit chain: source 413 rows (intact), restored 413 rows (intact)
- Restore time (scratch database to verified copy): 2.9 s; whole drill: 6.5 s

| Step | Time |
|---|---|
| Fingerprint the source tenant | 0.35 s |
| Check the source audit chain | 0.04 s |
| Dump the shared reference data | 0.44 s |
| Dump the tenant schema | 0.69 s |
| Create the scratch database | 0.42 s |
| Apply the global migrations | 0.27 s |
| Restore the shared reference data | 0.33 s |
| Restore the tenant schema | 1.72 s |
| Fingerprint the restored copy | 0.14 s |
| Check the restored audit chain | 0.03 s |
| Drop the scratch database | 2.05 s |

## Differences: none
