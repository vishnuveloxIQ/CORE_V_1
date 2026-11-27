-- Self-service registration (database-wide, not per tenant). Two tables, both in public:
--  core_tenant_directory: which company a login-ID prefix belongs to, so sign-in can find the company from the login ID
--    alone. One row per company prefix; tenant_id names the tenant_<id> schema.
--  core_registration_otp: one-time codes sent to an email address or mobile number during registration. Only a hash
--    of the code is stored; a code is used once and expires.

CREATE TABLE core_tenant_directory (
  login_prefix text PRIMARY KEY CHECK (login_prefix ~ '^[A-Z]{3,10}$'),
  tenant_id text NOT NULL UNIQUE CHECK (tenant_id ~ '^[a-z][a-z0-9_]{0,39}$'),
  company_name text NOT NULL CHECK (char_length(company_name) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The companies that already exist in this database.
INSERT INTO core_tenant_directory (login_prefix, tenant_id, company_name) VALUES
  ('ACME', 'acme', 'Acme'),
  ('VELOX', 'acme', 'Acme'),
  ('BETA', 'beta', 'Beta'),
  ('GAMMA', 'gamma', 'Gamma'),
  ('DELTA', 'delta', 'Delta'),
  ('EPSILON', 'epsilon', 'Epsilon')
ON CONFLICT DO NOTHING;

CREATE TABLE core_registration_otp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('email', 'mobile')),
  target text NOT NULL CHECK (char_length(target) BETWEEN 3 AND 200),
  code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX core_registration_otp_target_idx ON core_registration_otp (channel, target, created_at DESC);

-- The application login (role core_app, see scripts/admin) reads the directory and writes the codes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'core_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON core_tenant_directory, core_registration_otp TO core_app;
  END IF;
END
$$;
