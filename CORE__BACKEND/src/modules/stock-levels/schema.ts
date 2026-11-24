import { z } from 'zod';

/** numeric(14,3): zero or more, at most 11 digits before the point and 3 after. */
const MAX_QUANTITY = 99999999999.999;
const quantity = z
  .number()
  .min(0)
  .max(MAX_QUANTITY)
  .refine((value) => Math.round(value * 1000) / 1000 === value, 'at most 3 decimal places');

const versionField = z.number().int().min(1);

/** Optional list filters. A missing filter lists every row. */
export const stockFilterQuery = z.object({
  storeId: z.uuid().optional(),
  materialId: z.uuid().optional(),
});

export const stockLevelCreateBody = z.object({
  storeId: z.uuid(),
  materialId: z.uuid(),
  qty: quantity.optional(),
  reserved: quantity.optional(),
});

const stockLevelPatchFields = z.object({
  qty: quantity.optional(),
  reserved: quantity.optional(),
});

/** At least one quantity must be sent. rowVersion is the version the client read (optimistic lock). */
export const stockLevelPatchBody = stockLevelPatchFields
  .extend({ rowVersion: versionField })
  .refine((body) => body.qty !== undefined || body.reserved !== undefined, {
    message: 'send qty, reserved or both',
  });

export const stockLevelIdParams = z.object({ id: z.uuid() });

export type StockLevelCreateInput = z.infer<typeof stockLevelCreateBody>;
export type StockLevelPatchInput = z.infer<typeof stockLevelPatchBody>;
