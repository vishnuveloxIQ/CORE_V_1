import type { PoolClient } from 'pg';
import { lockWithinSchema } from '../../db/tenant.js';
import type { OfflineOperationInput } from './schema.js';

export interface RecordedOfflineOperation {
  id: string;
  duplicate: boolean;
}

/**
 * Stores an offline operation with sync_status 'received'. A device may resend the same operation,
 * so (device, operation key) is checked under a lock and a repeat returns the stored row.
 * Must run inside withTenant.
 */
export async function recordOfflineOperation(
  client: PoolClient,
  input: OfflineOperationInput,
): Promise<RecordedOfflineOperation> {
  await lockWithinSchema(client, `offline:${input.clientDeviceKey}:${input.clientOperationKey}`);

  const existing = await client.query<{ id: string }>(
    `SELECT id FROM integ_offline_operation
     WHERE client_device_key = $1 AND client_operation_key = $2
     LIMIT 1`,
    [input.clientDeviceKey, input.clientOperationKey],
  );
  const found = existing.rows[0];
  if (found) {
    return { id: found.id, duplicate: true };
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO integ_offline_operation (
       client_operation_key, client_device_key, user_id, project_id, store_id,
       operation_type, payload, captured_at, received_at, sync_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz, now(), 'received')
     RETURNING id`,
    [
      input.clientOperationKey,
      input.clientDeviceKey,
      input.userId ?? null,
      input.projectId ?? null,
      input.storeId ?? null,
      input.operationType,
      JSON.stringify(input.payload),
      input.capturedAt,
    ],
  );
  const created = inserted.rows[0];
  if (!created) {
    throw new Error('insert into integ_offline_operation returned no row');
  }
  return { id: created.id, duplicate: false };
}
