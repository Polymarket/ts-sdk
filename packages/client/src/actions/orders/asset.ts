import {
  type PositionId,
  type TokenId,
  toPositionId,
  toTokenId,
} from '@polymarket/bindings';
import { ExchangeOrderProtocolVersion } from '../../exchange';

const UINT256_MAX = (1n << 256n) - 1n;
const V2_RESERVED_BITS_MASK = ((1n << 64n) - 1n) << 40n;

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
export function createOrderRouting(assetId: string): OrderRouting {
  return isV2AssetId(assetId)
    ? {
        assetId: toPositionId(assetId),
        exchangeVersion: ExchangeOrderProtocolVersion.V3,
      }
    : {
        assetId: toTokenId(assetId),
        exchangeVersion: ExchangeOrderProtocolVersion.V2,
      };
}

function isV2AssetId(assetId: string): boolean {
  try {
    const value = BigInt(assetId);

    return (
      value >= 0n &&
      value <= UINT256_MAX &&
      (value & V2_RESERVED_BITS_MASK) === 0n
    );
  } catch {
    return false;
  }
}
