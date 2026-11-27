-- A company can have more than one login-ID prefix. Acme's existing users sign in as VELOX (and ACME is accepted too),
-- so the directory must allow two prefixes for one tenant. The first directory migration (0043) made tenant_id unique,
-- which blocked the second prefix; this drops that rule and adds the missing prefix.

ALTER TABLE core_tenant_directory DROP CONSTRAINT IF EXISTS core_tenant_directory_tenant_id_key;

INSERT INTO core_tenant_directory (login_prefix, tenant_id, company_name) VALUES
  ('VELOX', 'acme', 'Acme')
ON CONFLICT DO NOTHING;
