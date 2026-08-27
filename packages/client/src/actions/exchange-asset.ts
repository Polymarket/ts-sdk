import type { PositionId, TokenId } from '@polymarket/bindings';
import { z } from 'zod';

const ExchangeAssetIdSchema = z
  .string()
  .transform((value): TokenId | PositionId => value as TokenId | PositionId);

export function exchangeAssetRequestSchema<TShape extends z.ZodRawShape>(
  shape: TShape,
) {
  return z.union([
    z.object({
      ...shape,
      assetId: ExchangeAssetIdSchema,
      tokenId: z.never().optional(),
    }),
    z.object({
      ...shape,
      assetId: z.never().optional(),
      tokenId: z.string(),
    }),
  ]);
}

export function optionalExchangeAssetRequestSchema<
  TShape extends z.ZodRawShape,
>(shape: TShape) {
  return z.union([
    z.object({
      ...shape,
      assetId: ExchangeAssetIdSchema.optional(),
      tokenId: z.never().optional(),
    }),
    z.object({
      ...shape,
      assetId: z.never().optional(),
      tokenId: z.string().optional(),
    }),
  ]);
}
