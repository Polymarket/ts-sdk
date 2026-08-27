import { ClobAssetIdSchema } from '@polymarket/bindings';
import { z } from 'zod';

/** @internal */
export const OrderAssetInputSchema = z.union([
  z.object({
    assetId: ClobAssetIdSchema,
    tokenId: z.never().optional(),
  }),
  z.object({
    assetId: z.never().optional(),
    tokenId: ClobAssetIdSchema,
  }),
]);
