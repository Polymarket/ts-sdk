import { ClobAssetIdSchema } from '@polymarket/bindings';
import { z } from 'zod';

/** @internal */
export const AssetIdOrderAssetSchema = z.object({
  assetId: ClobAssetIdSchema,
  tokenId: z.never().optional(),
});

/** @internal */
export const TokenIdOrderAssetSchema = z.object({
  assetId: z.never().optional(),
  tokenId: ClobAssetIdSchema,
});
