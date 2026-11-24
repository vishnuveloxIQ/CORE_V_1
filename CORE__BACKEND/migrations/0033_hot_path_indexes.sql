-- CORE-20-05: indexes for the hot paths found by EXPLAIN (evidence/sprint-review-2026-11-21/sql/).
-- Each index matches its query's exact ORDER BY, so the first page is read from the index without a sort.

-- Every token refresh looks a session up by its refresh hash. Sessions are kept after they end, so without an index
-- this lookup scans every session ever opened. Refresh tokens are random 256-bit values, so the hash is unique.
CREATE UNIQUE INDEX core_user_session_refresh_hash_key ON core_user_session (refresh_hash);

-- Access history (GET /audit-log/auth-events): ORDER BY occurred_at DESC NULLS LAST, id.
CREATE INDEX ix_core_auth_activity_occurred_at ON core_auth_activity (occurred_at DESC NULLS LAST, id);

-- The approval inbox: WHERE status = ... ORDER BY raised_at DESC, code.
CREATE INDEX ix_core_approval_request_status_raised_at ON core_approval_request (status, raised_at DESC, code);

-- The audit trail (GET /audit-log): ORDER BY changed_at DESC NULLS LAST, id. The existing ascending index on
-- changed_at cannot give NULLS LAST in descending order, so the first page needed a full sort.
CREATE INDEX ix_audit_row_change_changed_at_desc ON audit_row_change (changed_at DESC NULLS LAST, id);
