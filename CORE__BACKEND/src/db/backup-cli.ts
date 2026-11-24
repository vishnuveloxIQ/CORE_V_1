import { loadEnv } from '../config/env.js';
import { backupTenant, restoreTenant } from './backup.js';

const USAGE = `Usage:
  npm run db:backup -- <tenantId> <file>                    dump tenant_<tenantId> to a custom-format file
  npm run db:restore -- <tenantId> <file> --replace         restore tenant_<tenantId>, replacing its objects

Backup files contain personal and tenant data. Store them encrypted and outside the repository.`;

/** Entry point for `npm run db:backup` and `npm run db:restore`. */
async function main(): Promise<void> {
  const [command, tenantId, file, ...flags] = process.argv.slice(2);
  if ((command !== 'backup' && command !== 'restore') || !tenantId || !file) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const env = loadEnv();
  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to .env (see .env.example).');
    process.exitCode = 1;
    return;
  }

  try {
    if (command === 'backup') {
      await backupTenant(env.DATABASE_URL, tenantId, file);
      console.log(`backed up tenant_${tenantId} to ${file}`);
    } else {
      await restoreTenant(env.DATABASE_URL, tenantId, file, {
        replace: flags.includes('--replace'),
      });
      console.log(`restored tenant_${tenantId} from ${file}`);
    }
  } catch (err) {
    // Only the message is printed. It is built so that it never contains the connection string.
    console.error(err instanceof Error ? err.message : 'backup or restore failed');
    process.exitCode = 1;
  }
}

await main();
