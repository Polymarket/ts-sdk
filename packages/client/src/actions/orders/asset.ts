import {
  type PositionId,
  PositionIdSchema,
  type TokenId,
  TokenIdSchema,
  toPositionId,
  toTokenId,
} from '@polymarket/bindings';
import { z } from 'zod';
import { ExchangeOrderProtocolVersion } from '../../exchange';

/**
 * Identifies the asset to trade. Provide exactly one identifier.
 */
export type OrderAsset =
  | {
      /** CTF token identifier. */
      tokenId: string;
      positionId?: never;
    }
  | {
      /** Polymarket V2 position identifier. */
      positionId: string;
      tokenId?: never;
    };

/** @internal */
export const TokenOrderAssetSchema = z.object({
  tokenId: TokenIdSchema,
  positionId: z.never().optional(),
});

/** @internal */
export const PositionOrderAssetSchema = z.object({
  positionId: PositionIdSchema,
  tokenId: z.never().optional(),
});

/** @internal */
export type OrderAssetId = PositionId | TokenId;

/** @internal */
export type OrderRouting =
  | {
      assetId: TokenId;
      exchangeVersion: ExchangeOrderProtocolVersion.V2;
    }
  | {
      assetId: PositionId;
      exchangeVersion: ExchangeOrderProtocolVersion.V3;
    };

/** @internal */
export function createOrderRouting(request: OrderAsset): OrderRouting {
  return request.positionId !== undefined
    ? {
        assetId: toPositionId(request.positionId),
        exchangeVersion: ExchangeOrderProtocolVersion.V3,
      }
    : {
        assetId: toTokenId(request.tokenId),
        exchangeVersion: ExchangeOrderProtocolVersion.V2,
      };
}
