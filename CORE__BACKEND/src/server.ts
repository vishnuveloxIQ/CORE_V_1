import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createPool } from './db/client.js';
import { startReminderSchedule } from './modules/approvals/reminders.js';

const env = loadEnv();
const pool = env.DATABASE_URL ? createPool(env.DATABASE_URL) : undefined;
const provisionPool = env.PROVISION_DATABASE_URL ? createPool(env.PROVISION_DATABASE_URL, 1) : undefined;
const app = buildApp({
  env,
  pool,
  provisionPool,
  readinessChecks: pool
    ? [{ name: 'database', run: () => pool.query('SELECT 1').then(() => undefined) }]
    : [],
});

// approval reminders: the same level is reminded again after each interval, never escalated
const stopReminders =
  pool && env.APPROVAL_REMINDER_MINUTES > 0 ? startReminderSchedule(pool, env.APPROVAL_REMINDER_MINUTES, app.log) : () => undefined;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopReminders();
    app
      .close()
      .then(() => pool?.end())
      .then(
        () => process.exit(0),
        () => process.exit(1),
      );
  });
}

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
