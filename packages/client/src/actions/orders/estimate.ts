import {
  OrderSide,
  OrderType,
  PositiveDecimalNumberSchema,
  type TickSizeValue,
} from '@polymarket/bindings';
import type { OrderBook, OrderBookLevel } from '@polymarket/bindings/clob';
import { invariant } from '@polymarket/types';
import { z } from 'zod';
import type { BaseClient } from '../../clients';
import {
  InsufficientLiquidityError,
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../../errors';
import { parseUserInput } from '../../input';
import { fetchOrderBook } from '../clob';

const BaseEstimateMarketPriceRequestSchema = z.object({
  tokenId: z.string(),
  orderType: z
    .union([z.literal(OrderType.FAK), z.literal(OrderType.FOK)])
    .default(OrderType.FOK),
});

export type EstimateMarketBuyPriceRequest = {
  /** TokenID of the Conditional token asset to estimate. */
  tokenId: string;

  /** Buy side of the estimate. */
  side: OrderSide.BUY;

  /** Desired USD buy notional to match against current ask depth. */
  amount: number | string;

  /**
   * Market order execution type to model.
   *
   * @defaultValue OrderType.FOK
   */
  orderType?: OrderType.FAK | OrderType.FOK;
};

export type EstimateMarketSellPriceRequest = {
  /** TokenID of the Conditional token asset to estimate. */
  tokenId: string;

  /** Sell side of the estimate. */
  side: OrderSide.SELL;

  /** Number of conditional-token shares to match against current bid depth. */
  shares: number | string;

  /**
   * Market order execution type to model.
   *
   * @defaultValue OrderType.FOK
   */
  orderType?: OrderType.FAK | OrderType.FOK;
};

export type EstimateMarketPriceRequest =
  | EstimateMarketBuyPriceRequest
  | EstimateMarketSellPriceRequest;

const EstimateMarketPriceRequestSchema = z.discriminatedUnion('side', [
  BaseEstimateMarketPriceRequestSchema.extend({
    side: z.literal(OrderSide.BUY),
    amount: PositiveDecimalNumberSchema,
  }),
  BaseEstimateMarketPriceRequestSchema.extend({
    side: z.literal(OrderSide.SELL),
    shares: PositiveDecimalNumberSchema,
  }),
]) satisfies z.ZodType<EstimateMarketPriceRequest>;

export type EstimateMarketPriceError =
  | InsufficientLiquidityError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const EstimateMarketPriceError = makeErrorGuard(
  InsufficientLiquidityError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Estimates the price level a market order would cross at current book depth.
 *
 * For BUY orders, `amount` is the amount of collateral to spend. For SELL
 * orders, `shares` is the number of shares to sell.
 *
 * When `orderType` is `FOK`, this estimate requires enough resting liquidity to
 * satisfy the full requested amount and throws if the book is too thin. When
 * `orderType` is `FAK`, the estimate may fall back to the best currently
 * available price level even if the full requested amount cannot fill, so it
 * should be treated as a partial-fill execution estimate rather than a full-fill
 * guarantee.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const price = await estimateMarketPrice(client, {
 *   tokenId:
 *     '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 *   side: OrderSide.BUY,
 *   amount: 10,
 * });
 *
 * // price === 0.53
 * ```
 *
 * @throws {@link EstimateMarketPriceError}
 * Thrown on failure.
 */
export async function estimateMarketPrice(
  client: BaseClient,
  request: EstimateMarketPriceRequest,
): Promise<number> {
  const params = parseUserInput(request, EstimateMarketPriceRequestSchema);
  const amount = params.side === OrderSide.BUY ? params.amount : params.shares;

  return resolveEstimatedMarketPrice(client, {
    amount,
    orderType: params.orderType,
    side: params.side,
    tokenId: params.tokenId,
  });
}

/** @internal */
export async function resolveEstimatedMarketPrice(
  client: BaseClient,
  params: {
    amount: number;
    orderType: OrderType;
    side: OrderSide;
    tokenId: string;
  },
): Promise<number> {
  const orderBook = await fetchOrderBook(client, {
    tokenId: params.tokenId,
  });

  return resolveMarketPriceFromOrderBook({
    amount: params.amount,
    orderBook,
    orderType: params.orderType,
    side: params.side,
  });
}

/** @internal */
export function resolveMarketPriceFromOrderBook(params: {
  amount: number;
  orderBook: OrderBook;
  orderType: OrderType;
  side: OrderSide;
}): number {
  const { orderBook } = params;

  const price =
    params.side === OrderSide.BUY
      ? calculateBuyMarketPrice(orderBook.asks, params.amount, params.orderType)
      : calculateSellMarketPrice(
          orderBook.bids,
          params.amount,
          params.orderType,
        );

  invariant(
    isValidPrice(price, orderBook.tickSize),
    `Resolved market price fell outside the valid range for tick size ${orderBook.tickSize}.`,
  );

  return price;
}

function isValidPrice(price: number, tickSize: TickSizeValue): boolean {
  return price >= tickSize && price <= 1 - tickSize;
}

function calculateBuyMarketPrice(
  positions: OrderBookLevel[],
  amountToMatch: number,
  orderType: OrderType,
): number {
  if (positions.length === 0) {
    throw new InsufficientLiquidityError('No resting liquidity.');
  }

  let sum = 0;

  for (let index = positions.length - 1; index >= 0; index -= 1) {
    const position = positions[index];

    if (position === undefined) {
      continue;
    }

    sum += Number.parseFloat(position.size) * Number.parseFloat(position.price);

    if (sum >= amountToMatch) {
      return Number.parseFloat(position.price);
    }
  }

  if (orderType === OrderType.FOK) {
    throw new InsufficientLiquidityError(
      'Insufficient liquidity for full fill.',
    );
  }

  // biome-ignore lint/style/noNonNullAssertion: Checked for emptiness above.
  const bestPosition = positions[0]!;

  return Number.parseFloat(bestPosition.price);
}

function calculateSellMarketPrice(
  positions: OrderBookLevel[],
  amountToMatch: number,
  orderType: OrderType,
): number {
  if (positions.length === 0) {
    throw new InsufficientLiquidityError('No resting liquidity.');
  }

  let sum = 0;

  for (let index = positions.length - 1; index >= 0; index -= 1) {
    const position = positions[index];

    if (position === undefined) {
      continue;
    }

    sum += Number.parseFloat(position.size);

    if (sum >= amountToMatch) {
      return Number.parseFloat(position.price);
    }
  }

  if (orderType === OrderType.FOK) {
    throw new InsufficientLiquidityError(
      'Insufficient liquidity for full fill.',
    );
  }

  // biome-ignore lint/style/noNonNullAssertion: Checked for emptiness above.
  const bestPosition = positions[0]!;

  return Number.parseFloat(bestPosition.price);
}
