// Development only. Loads sample approved people (one set per project the tenant holds) and a sample subscription,
// invoices and plan catalogue into tenant schemas. Nothing here runs in a migration, and a table that already has rows is left alone.
// Usage: PROVISION_DATABASE_URL=... node scripts/load-dev-approved-people-billing.mjs [tenantId ...]   (no ids: every tenant_* schema)
import pg from 'pg';

const url = process.env.PROVISION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('Set PROVISION_DATABASE_URL (or DATABASE_URL).');
  process.exit(1);
}

const PEOPLE = [
  ['Engineering and design', 'Site engineer', [['Venkat Rao', 'Onboarded', '2026-12-01'], ['Anil Kumar', 'Onboarded', '2026-12-05'], ['Sunitha Reddy', 'With HRMS', '2026-12-01']]],
  ['Engineering and design', 'Quality engineer', [['Priya Nair', 'Approved', '2026-12-15']]],
  ['Projects', 'Surveyor', [['Imran Khan', 'Approved', '2026-12-10'], ['Rahul Varma', 'With HRMS', '2026-12-20']]],
  ['Quality and safety', 'Safety officer', [['Meena Iyer', 'Onboarded', '2026-12-03'], ['Harish Babu', 'Approved', '2026-12-18']]],
  ['Stores and procurement', 'Store keeper', [['Ganesh Prasad', 'With HRMS', '2026-12-08']]],
];

const SUBSCRIPTION = {
  account_id: 'SUB-VIQ-0042', plan: 'Enterprise', status: 'Active', billing_cycle: 'Annual', auto_renew: true,
  start_date: '2025-12-01', renewal_date: '2026-12-01', next_invoice_date: '2026-11-24', base_amount: 1250000, gst_rate: 18,
  support_tier: 'Priority, 24x7 phone and email', account_manager: 'Meera Nair',
  payment_method: 'Bank transfer (NEFT), HDFC Bank ending 4821', billing_email: 'accounts@veloxiq.co.in',
  limit_users: 250, limit_projects: 40, limit_sites: 120, limit_storage_gb: 500,
  modules: ['Human Resource Management System', 'Material Management', 'Petty Cash Management', 'Fleet and Equipment Management'],
};
const INVOICES = [
  ['INV-2025-118', '2025-12-01', '1 Dec 2025 – 30 Nov 2026', 1475000, 'Paid'],
  ['INV-2025-061', '2025-06-10', 'Add-on: Equipment module', 236000, 'Paid'],
  ['INV-2024-094', '2024-12-01', '1 Dec 2024 – 30 Nov 2025', 1298000, 'Paid'],
];
const PLANS = [
  ['Standard', 450000, 50, 10, 30, 100, 'Email'],
  ['Professional', 850000, 120, 25, 70, 250, 'Priority email'],
  ['Enterprise', 1250000, 250, 40, 120, 500, '24×7 phone and email'],
  ['Enterprise Plus', 1900000, 600, 100, 300, 1000, 'Dedicated manager'],
];

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const wanted = process.argv.slice(2).map((id) => `tenant_${id}`);
  const { rows } = await pool.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant\\_%' ORDER BY 1");
  const schemas = rows.map((r) => r.schema_name).filter((s) => wanted.length === 0 || wanted.includes(s));
  for (const schema of schemas) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO ${schema}, public`);
      const has = async (table) => (await client.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount > 0;
      const out = [];

      if (await has('core_approved_person')) out.push('people: kept');
      else {
        const projects = (await client.query('SELECT id FROM core_project ORDER BY code, id')).rows;
        let n = 0;
        for (const p of projects) {
          for (const [department, designation, list] of PEOPLE) {
            for (const [name, status, joining] of list) {
              await client.query(
                'INSERT INTO core_approved_person (project_id, department, name, designation, joining_date, status) VALUES ($1,$2,$3,$4,$5,$6)',
                [p.id, department, name, designation, joining, status],
              );
              n += 1;
            }
          }
        }
        out.push(`people: ${n}`);
      }

      if (await has('core_subscription')) out.push('subscription: kept');
      else {
        const s = SUBSCRIPTION;
        await client.query(
          `INSERT INTO core_subscription (account_id, plan, status, billing_cycle, auto_renew, start_date, renewal_date, next_invoice_date,
             base_amount, gst_rate, support_tier, account_manager, payment_method, billing_email, limit_users, limit_projects, limit_sites,
             limit_storage_gb, modules) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
          [s.account_id, s.plan, s.status, s.billing_cycle, s.auto_renew, s.start_date, s.renewal_date, s.next_invoice_date, s.base_amount,
            s.gst_rate, s.support_tier, s.account_manager, s.payment_method, s.billing_email, s.limit_users, s.limit_projects, s.limit_sites,
            s.limit_storage_gb, JSON.stringify(s.modules)],
        );
        out.push('subscription: 1');
      }
      if (await has('core_invoice')) out.push('invoices: kept');
      else {
        for (const i of INVOICES) await client.query('INSERT INTO core_invoice (invoice_no, invoice_date, period, amount, status) VALUES ($1,$2,$3,$4,$5)', i);
        out.push(`invoices: ${INVOICES.length}`);
      }
      if (await has('core_billing_plan')) out.push('plans: kept');
      else {
        for (const p of PLANS) await client.query('INSERT INTO core_billing_plan (name, price, users, projects, sites, storage_gb, support) VALUES ($1,$2,$3,$4,$5,$6,$7)', p);
        out.push(`plans: ${PLANS.length}`);
      }
      await client.query('COMMIT');
      console.log(`${schema}: ${out.join(', ')}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`${schema}: failed (${err instanceof Error ? err.message : 'error'})`);
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
