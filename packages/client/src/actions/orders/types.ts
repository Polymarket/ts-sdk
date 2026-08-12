import type {
  BuilderCode,
  OrderSide,
  OrderType,
  TokenId,
} from '@polymarket/bindings';
import type { OrderResponse, SignatureType } from '@polymarket/bindings/clob';
import type {
  Erc1271Signature,
  EvmAddress,
  EvmSignature,
  HexString,
} from '@polymarket/types';
import type { TypedDataPayload } from '../../types';
import type { SignOrderRequest } from '../../workflow';

type BasePrepareMarketOrderRequest = {
  /** TokenID of the Conditional token asset being traded */
  tokenId: string;

  /** Optional builder attribution code. */
  builderCode?: HexString;

  /**
   * Specifies the type of order execution.
   * - FOK (Fill or Kill): must be filled entirely or not at all
   * - FAK (Fill and Kill): partially fills, cancels any unfilled remainder
   *
   * @defaultValue OrderType.FAK
   */
  orderType?: OrderType.FAK | OrderType.FOK;
};

export type PrepareMarketBuyOrderRequest = BasePrepareMarketOrderRequest & {
  /** Buy side of the order. */
  side: OrderSide.BUY;

  /**
   * Desired USD notional to buy, before market and builder taker fees.
   *
   * By default, the SDK prepares the order for this full buy amount and applicable
   * fees are paid on top. Set `maxSpend` to let the SDK resize the amount against
   * an estimated all-in spend target.
   */
  amount: number | string;

  /**
   * Optional estimated all-in USD spend target for BUY market orders, including
   * market and builder taker fees.
   *
   * When provided, the SDK keeps `amount` unchanged if `maxSpend` covers the
   * requested buy amount plus estimated fees. Otherwise, the SDK reduces the
   * signed buy amount using the order price and recently resolved fee rates.
   *
   * Set `maxSpend` equal to `amount` when the requested amount should include
   * fees. Leave it unset to pay fees on top of `amount`.
   */
  maxSpend?: number | string;

  /**
   * Highest acceptable price per share for the BUY.
   *
   * The order may only fill at this price or better. For FOK, the full
   * `amount` must fill within this bound or the order is killed. For FAK, any
   * immediately available liquidity within this bound fills and the remainder
   * is canceled.
   */
  maxPrice?: number | string;
};

export type PrepareMarketSellOrderRequest = BasePrepareMarketOrderRequest & {
  /** Sell side of the order. */
  side: OrderSide.SELL;

  /**
   * Number of outcome tokens to sell.
   *
   * This is the human-readable token amount: `1` means one full share, not one
   * 6-decimal base unit.
   */
  shares: number | string;

  /**
   * Lowest acceptable price per share for the SELL.
   *
   * The order may only fill at this price or better. For FOK, all `shares`
   * must fill within this bound or the order is killed. For FAK, any
   * immediately available liquidity within this bound fills and the remainder
   * is canceled.
   */
  minPrice?: number | string;
};

export type PrepareMarketOrderRequest =
  | PrepareMarketBuyOrderRequest
  | PrepareMarketSellOrderRequest;

export type PrepareLimitOrderRequest = {
  /** TokenID of the Conditional token asset being traded */
  tokenId: string;

  /** Price used to create the order */
  price: number | string;

  /**
   * Order size in outcome tokens.
   *
   * This is the human-readable token amount: `1` means one full share, not one
   * 6-decimal base unit.
   */
  size: number | string;

  /** Side of the order */
  side: OrderSide;

  /** Optional builder attribution code. */
  builderCode?: HexString;

  /**
   * Posts the prepared order as post-only when submitted.
   *
   * @defaultValue false
   */
  postOnly?: boolean;

  /**
   * Unix timestamp in seconds after which the order expires.
   *
   * When provided, the SDK prepares a Good-Til-Date (GTD) limit order that
   * expires at the given timestamp.
   *
   * The timestamp must be at least 3 minutes in the future. Add your own
   * buffer for network latency and clock skew when deriving it from the
   * current time.
   *
   * When omitted, the SDK prepares a Good-Til-Cancelled (GTC) limit order.
   */
  expiration?: number;
};

export type OrderDraft = {
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
  tokenId: TokenId;
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
  salt: string;
  side: OrderSide;
  signatureType: SignatureType;
  signer: EvmAddress;
  takerAmount: string;
  timestamp: string;
  tokenId: TokenId;
};

export type SignedOrder = {
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
  tokenId: TokenId;
  signature: EvmSignature | Erc1271Signature;
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
