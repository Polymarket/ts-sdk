import {
  ClobAssetIdSchema,
  type PositionId,
  type TokenId,
} from '@polymarket/bindings';
import { z } from 'zod';

/** @internal */
export type OrderAssetId = PositionId | TokenId;

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
