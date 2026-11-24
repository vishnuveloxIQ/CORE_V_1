import { z } from 'zod';

/** Body of POST /offline-operations: one operation captured on a device while offline. */
export const offlineOperationSchema = z.object({
  clientDeviceKey: z.string().min(1).max(128),
  clientOperationKey: z.string().min(1).max(128),
  operationType: z.string().min(1).max(64),
  capturedAt: z.iso.datetime({ offset: true }),
  userId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  locationId: z.uuid().optional(),
  storeId: z.uuid().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export type OfflineOperationInput = z.infer<typeof offlineOperationSchema>;
