-- audit_row_change is append-only. UPDATE, DELETE and TRUNCATE raise an error.
-- This stops application code from editing history. It does not stop the table owner or a superuser,
-- who can disable the trigger; the chain check (verifyAuditChain) is what detects that.

CREATE FUNCTION audit_row_change_block_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_row_change is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_row_change_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_row_change
  FOR EACH ROW EXECUTE FUNCTION audit_row_change_block_change();

CREATE TRIGGER audit_row_change_no_truncate
  BEFORE TRUNCATE ON audit_row_change
  FOR EACH STATEMENT EXECUTE FUNCTION audit_row_change_block_change();
