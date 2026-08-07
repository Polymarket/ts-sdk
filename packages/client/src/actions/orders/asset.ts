import {
  type PositionId,
  PositionIdSchema,
  type TokenId,
  TokenIdSchema,
  toPositionId,
  toTokenId,
} from '@polymarket/bindings';
import { z } from 'zod';
import type { OrderAsset, ResolvedOrderAsset } from './types';

const TokenOrderAssetSchema = z.object({
  tokenId: TokenIdSchema,
  positionId: z.never().optional(),
});

const PositionOrderAssetSchema = z.object({
  positionId: PositionIdSchema,
  tokenId: z.never().optional(),
});

/** @internal */
export const OrderAssetParamsSchema = z.union([
  TokenOrderAssetSchema,
  PositionOrderAssetSchema,
]);

/** @internal */
export type OrderAssetId = PositionId | TokenId;

/** @internal */
export function resolveOrderAsset(request: OrderAsset): ResolvedOrderAsset {
  return request.positionId !== undefined
    ? { positionId: toPositionId(request.positionId) }
    : { tokenId: toTokenId(request.tokenId) };
}

/** @internal */
export function resolveOrderAssetId(asset: ResolvedOrderAsset): OrderAssetId {
  return asset.positionId ?? asset.tokenId;
}

/** @internal */
export function isPositionOrderAsset(
  asset: ResolvedOrderAsset,
): asset is Extract<ResolvedOrderAsset, { positionId: PositionId }> {
  return asset.positionId !== undefined;
}
