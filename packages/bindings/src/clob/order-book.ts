import { z } from 'zod';
import {
  type CtfConditionId,
  CtfConditionIdSchema,
  type DecimalString,
  DecimalStringSchema,
  type EpochMilliseconds,
  EpochMillisecondsStringSchema,
  type TickSizeValue,
  TickSizeValueSchema,
  type TokenId,
  TokenIdSchema,
} from '../shared';

export type OrderBookLevel = {
  price: DecimalString;
  size: DecimalString;
};

/** SHA-1 hash of the serialized order book summary, encoded as bare lowercase hex. */
export type OrderBookHash = string & { readonly __tag: 'OrderBookHash' };

export type OrderBook = {
  /** CTF condition id for the market this book belongs to. */
  conditionId: CtfConditionId;
  tokenId: TokenId;
  timestamp?: EpochMilliseconds | null;

  /** Bid levels in ascending price order, lowest bid first. */
  bids: OrderBookLevel[];

  /** Ask levels in descending price order, highest ask first. */
  asks: OrderBookLevel[];

  minOrderSize: DecimalString;
  tickSize: TickSizeValue;
  negRisk: boolean;
  lastTradePrice?: DecimalString | null;
  hash: OrderBookHash;
};

export const OrderBookLevelSchema = z.object({
  price: DecimalStringSchema,
  size: DecimalStringSchema,
}) satisfies z.ZodType<OrderBookLevel>;

export const OrderBookHashSchema = z
  .string()
  .regex(/^[a-f0-9]{40}$/)
  .transform((value) => value as OrderBookHash);

const OrderBookTickSizeSchema =
  DecimalStringSchema.transform(Number).pipe(TickSizeValueSchema);

export const OrderBookSchema = z
  .object({
    market: CtfConditionIdSchema,
    asset_id: TokenIdSchema,
    timestamp: EpochMillisecondsStringSchema.nullish(),
    bids: z.array(OrderBookLevelSchema),
    asks: z.array(OrderBookLevelSchema),
    min_order_size: DecimalStringSchema,
    tick_size: OrderBookTickSizeSchema,
    neg_risk: z.boolean(),
    last_trade_price: DecimalStringSchema.nullish(),
    hash: OrderBookHashSchema,
  })
  .transform(
    ({
      market,
      asset_id,
      min_order_size,
      tick_size,
      neg_risk,
      last_trade_price,
      ...rest
    }) => ({
      ...rest,
      conditionId: market,
      tokenId: asset_id,
      minOrderSize: min_order_size,
      tickSize: tick_size,
      negRisk: neg_risk,
      lastTradePrice: last_trade_price,
    }),
  ) satisfies z.ZodType<OrderBook>;

export const FetchOrderBookResponseSchema = OrderBookSchema;
export const OrderBooksSchema = z.array(OrderBookSchema);

export type OrderBooks = OrderBook[];
export type FetchOrderBookResponse = OrderBook;
