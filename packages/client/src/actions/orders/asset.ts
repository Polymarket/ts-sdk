import {
  type PositionId,
  type TokenId,
  toPositionId,
  toTokenId,
} from '@polymarket/bindings';
import { ExchangeOrderProtocolVersion } from '../../exchange';
import { isV2PositionId } from '../../protocol';

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
export function createOrderRouting(assetId: OrderAssetId): OrderRouting {
  return isV2PositionId(assetId)
    ? {
        assetId: toPositionId(assetId),
        exchangeVersion: ExchangeOrderProtocolVersion.V3,
      }
    : {
        assetId: toTokenId(assetId),
        exchangeVersion: ExchangeOrderProtocolVersion.V2,
      };
}
