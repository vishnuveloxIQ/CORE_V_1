# Restore drill: tenant acme

- Started: 2026-11-22T12:25:58.005Z
- Result: **PASSED**
- Tables: 65, rows: 2369, dump size: 1205.0 KiB
- Audit chain: source 708 rows (intact), restored 708 rows (intact)
- Restore time (scratch database to verified copy): 1.5 s; whole drill: 3.8 s

| Step | Time |
|---|---|
| Fingerprint the source tenant | 0.33 s |
| Check the source audit chain | 0.04 s |
| Dump the shared reference data | 0.27 s |
| Dump the tenant schema | 0.38 s |
| Create the scratch database | 0.22 s |
| Apply the global migrations | 0.10 s |
| Restore the shared reference data | 0.10 s |
| Restore the tenant schema | 0.96 s |
| Fingerprint the restored copy | 0.12 s |
| Check the restored audit chain | 0.02 s |
| Drop the scratch database | 1.22 s |

## Differences: none
