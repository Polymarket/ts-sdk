import type {
  BuilderCode,
  ClobAssetId,
  OrderSide,
  OrderType,
  PositionId,
  TokenId,
} from '@polymarket/bindings';
import type { OrderResponse, SignatureType } from '@polymarket/bindings/clob';
import type {
  Erc1271Signature,
  EvmAddress,
  EvmSignature,
  HexString,
  SessionSignerSignature,
} from '@polymarket/types';
import type { ExchangeOrderProtocolVersion } from '../../exchange';
import type { TypedDataPayload } from '../../types';
import type { SignOrderRequest } from '../../workflow';

export type PrepareMarketBuyOrderRequest =
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId: string;
      tokenId?: never;
      /** Buy side of the order. */
      side: OrderSide.BUY;
      /**
       * Desired USD notional to buy, before market and builder taker fees.
       * Fees are paid on top unless `maxSpend` limits the all-in spend.
       */
      amount: number | string;
      /**
       * Optional estimated all-in USD spend target, including applicable fees.
       * The SDK reduces the signed buy amount when necessary to stay within it.
       */
      maxSpend?: number | string;
      /** Highest acceptable price per share; the order only fills at this price or better. */
      maxPrice?: number | string;
      /** Optional builder attribution code. */
      builderCode?: string;
      /** @defaultValue OrderType.FAK */
      orderType?: OrderType.FAK | OrderType.FOK;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId: string;
      /** Buy side of the order. */
      side: OrderSide.BUY;
      /**
       * Desired USD notional to buy, before market and builder taker fees.
       * Fees are paid on top unless `maxSpend` limits the all-in spend.
       */
      amount: number | string;
      /**
       * Optional estimated all-in USD spend target, including applicable fees.
       * The SDK reduces the signed buy amount when necessary to stay within it.
       */
      maxSpend?: number | string;
      /** Highest acceptable price per share; the order only fills at this price or better. */
      maxPrice?: number | string;
      /** Optional builder attribution code. */
      builderCode?: string;
      /** @defaultValue OrderType.FAK */
      orderType?: OrderType.FAK | OrderType.FOK;
    };

export type PrepareMarketSellOrderRequest =
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId: string;
      tokenId?: never;
      /** Sell side of the order. */
      side: OrderSide.SELL;
      /** Number of outcome shares to sell in human-readable units. */
      shares: number | string;
      /** Lowest acceptable price per share; the order only fills at this price or better. */
      minPrice?: number | string;
      /** Optional builder attribution code. */
      builderCode?: string;
      /** @defaultValue OrderType.FAK */
      orderType?: OrderType.FAK | OrderType.FOK;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId: string;
      /** Sell side of the order. */
      side: OrderSide.SELL;
      /** Number of outcome shares to sell in human-readable units. */
      shares: number | string;
      /** Lowest acceptable price per share; the order only fills at this price or better. */
      minPrice?: number | string;
      /** Optional builder attribution code. */
      builderCode?: string;
      /** @defaultValue OrderType.FAK */
      orderType?: OrderType.FAK | OrderType.FOK;
    };

export type PrepareMarketOrderRequest =
  | PrepareMarketBuyOrderRequest
  | PrepareMarketSellOrderRequest;

export type PrepareLimitOrderRequest =
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId: string;
      tokenId?: never;
      /** Price used to create the order. */
      price: number | string;
      /** Order size in outcome shares, expressed in human-readable units. */
      size: number | string;
      /** Side of the order. */
      side: OrderSide;
      /** Optional builder attribution code. */
      builderCode?: string;
      /**
       * Posts the prepared order as post-only when submitted.
       * @defaultValue false
       */
      postOnly?: boolean;
      /**
       * Unix timestamp in seconds after which the order expires. When provided,
       * it must be at least 3 minutes in the future and creates a GTD order.
       */
      expiration?: number;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId: string;
      /** Price used to create the order. */
      price: number | string;
      /** Order size in outcome shares, expressed in human-readable units. */
      size: number | string;
      /** Side of the order. */
      side: OrderSide;
      /** Optional builder attribution code. */
      builderCode?: string;
      /**
       * Posts the prepared order as post-only when submitted.
       * @defaultValue false
       */
      postOnly?: boolean;
      /**
       * Unix timestamp in seconds after which the order expires. When provided,
       * it must be at least 3 minutes in the future and creates a GTD order.
       */
      expiration?: number;
    };

type BaseOrderDraft = {
  builderCode?: BuilderCode;
  chainId: number;
  exchangeAddress: EvmAddress;
  expiration: number;
  funderAddress: EvmAddress;
  offeredAmount: bigint;
  orderType: OrderType;
  side: OrderSide;
  signer: EvmAddress;
  requestedAmount: bigint;
};

/** @internal */
export type OrderDraft = BaseOrderDraft & {
  assetId: ClobAssetId;
};

/**
 * @internal
 */
export type UnsignedOrder = {
  chainId: number;
  builder: HexString;
  exchangeAddress: EvmAddress;
  expiration: number;
  maker: EvmAddress;
  makerAmount: string;
  metadata: HexString;
  orderType: OrderType;
  protocolVersion: ExchangeOrderProtocolVersion;
  salt: string;
  side: OrderSide;
  signatureType: SignatureType;
  signer: EvmAddress;
  takerAmount: string;
  timestamp: string;
  tokenId: PositionId | TokenId;
};

export type OrderSignature =
  | EvmSignature
  | Erc1271Signature
  | SessionSignerSignature;

export type SignedOrder = {
  /** Identifier for the CTF token or Polymarket V2 position being traded. */
  assetId: PositionId | TokenId;
  builder: HexString;
  expiration: number;
  maker: EvmAddress;
  makerAmount: string;
  metadata: HexString;
  orderType: OrderType;
  salt: string;
  side: OrderSide;
  signatureType: SignatureType;
  signer: EvmAddress;
  takerAmount: string;
  timestamp: string;
  /**
   * @deprecated Use `assetId`.
   *
   * Compatibility alias equal to `assetId`. The exchange wire payload retains
   * its protocol-defined `tokenId` field.
   */
  tokenId: PositionId | TokenId;
  signature: OrderSignature;
  postOnly?: boolean;
};

export type OrderWorkflowRequest = SignOrderRequest;

export type OrderWorkflow = AsyncGenerator<
  OrderWorkflowRequest,
  SignedOrder,
  EvmAddress | EvmSignature
>;

export type OrderPostingWorkflow = AsyncGenerator<
  OrderWorkflowRequest,
  OrderResponse,
  EvmAddress | EvmSignature
>;

/** @internal */
export function signOrder(payload: TypedDataPayload): SignOrderRequest {
  return {
    kind: 'signOrder',
    payload,
  };
}
