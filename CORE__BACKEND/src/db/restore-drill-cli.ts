import { writeFileSync } from 'node:fs';
import { loadEnv } from '../config/env.js';
import { drillReportMarkdown, runRestoreDrill } from './restore-drill.js';

const USAGE = `Usage:
  npm run db:drill -- <tenantId> [--report <file.md>] [--keep-dump]
      backs up tenant_<tenantId>, restores it into a scratch database, compares every table and the audit chain,
      then drops the scratch database. The source database is only read.
      --report writes the result as Markdown. --keep-dump keeps the dump files (they hold personal data).`;

/** Entry point for `npm run db:drill`. Exits 1 when the drill fails, so a scheduler can alert on it. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const tenantId = args[0];
  if (!tenantId || tenantId.startsWith('--')) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const reportAt = args.indexOf('--report');
  const reportFile = reportAt >= 0 ? args[reportAt + 1] : undefined;

  const env = loadEnv();
  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to .env (see .env.example).');
    process.exitCode = 1;
    return;
  }

  try {
    const report = await runRestoreDrill(env.DATABASE_URL, tenantId, { keepDump: args.includes('--keep-dump') });
    const markdown = drillReportMarkdown(report);
    console.log(markdown);
    if (reportFile) writeFileSync(reportFile, markdown);
    process.exitCode = report.ok ? 0 : 1;
  } catch (err) {
    // Only the message: it never contains the connection string.
    console.error(err instanceof Error ? err.message : 'the drill could not start');
    process.exitCode = 1;
  }
}

await main();
