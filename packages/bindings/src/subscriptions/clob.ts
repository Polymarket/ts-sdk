import { z } from 'zod';
import {
  CtfConditionIdSchema,
  DecimalStringSchema,
  EpochMillisecondsStringSchema,
  EpochMillisecondsToIsoDateTimeStringSchema,
  OptionalDecimalStringSchema,
  type OrderSide,
  OrderSideSchema,
  OrderTypeSchema,
  TokenIdSchema,
  TradeStatusSchema,
  toIsoDateTimeString,
} from '../shared';

// The websocket serializes absent optional decimals as an empty string (for
// example `fee_rate_bps` on a trade with no fee, or `best_bid`/`best_ask` when
// there is none), so optional decimal fields in these schemas use the
// ''-normalizing OptionalDecimalStringSchema.

const NormalizedOrderSideSchema: z.ZodType<OrderSide> = z.preprocess(
  (value) => (typeof value === 'string' ? value.toUpperCase() : value),
  OrderSideSchema,
);

export { TradeStatus } from '../shared';

export enum UserOrderStatus {
  Live = 'LIVE',
  Matched = 'MATCHED',
  Delayed = 'DELAYED',
  Unmatched = 'UNMATCHED',
  Canceled = 'CANCELED',
}

const UserOrderStatusSchema = z.enum(UserOrderStatus);

const OrderBookLevelSchema = z.object({
  price: DecimalStringSchema,
  size: DecimalStringSchema,
});

const EpochSecondsStringToIsoDateTimeStringSchema = z
  .string()
  .regex(/^\d+$/)
  .transform((value) =>
    toIsoDateTimeString(new Date(Number(value) * 1000).toISOString()),
  );

const ExpirationToIsoDateTimeStringSchema = z
  .string()
  .regex(/^\d+$/)
  .transform((value) =>
    value === '0'
      ? undefined
      : toIsoDateTimeString(new Date(Number(value) * 1000).toISOString()),
  );

export type OrderBookLevel = z.infer<typeof OrderBookLevelSchema>;

export const MarketBookEventSchema = z
  .object({
    event_type: z.literal('book'),
    market: z.string(),
    asset_id: TokenIdSchema,
    bids: z.array(OrderBookLevelSchema),
    asks: z.array(OrderBookLevelSchema),
    hash: z.string().nullish(),
    timestamp: EpochMillisecondsStringSchema.nullish(),
    min_order_size: OptionalDecimalStringSchema,
    tick_size: OptionalDecimalStringSchema,
    neg_risk: z.boolean().nullish(),
    last_trade_price: OptionalDecimalStringSchema,
  })
  .transform(
    ({
      event_type,
      asset_id,
      min_order_size,
      tick_size,
      neg_risk,
      last_trade_price,
      ...rest
    }) => {
      return {
        // Normalize to a consistent event envelope: `topic`, `type`, and `payload`.
        topic: 'market' as const,
        type: event_type,
        payload: {
          ...rest,
          tokenId: asset_id,
          minOrderSize: min_order_size,
          tickSize: tick_size,
          negRisk: neg_risk,
          lastTradePrice: last_trade_price,
        },
      };
    },
  );

export type MarketBookEvent = z.infer<typeof MarketBookEventSchema>;

const PriceChangeSchema = z
  .object({
    asset_id: TokenIdSchema,
    price: DecimalStringSchema,
    size: DecimalStringSchema,
    side: NormalizedOrderSideSchema,
    hash: z.string().nullish(),
    best_bid: OptionalDecimalStringSchema,
    best_ask: OptionalDecimalStringSchema,
  })
  .transform(({ asset_id, best_bid, best_ask, ...rest }) => ({
    ...rest,
    tokenId: asset_id,
    bestBid: best_bid,
    bestAsk: best_ask,
  }));

export type PriceChange = z.infer<typeof PriceChangeSchema>;

export const MarketPriceChangeEventSchema = z
  .object({
    event_type: z.literal('price_change'),
    market: z.string(),
    price_changes: z.array(PriceChangeSchema),
    timestamp: EpochMillisecondsStringSchema.nullish(),
  })
  .transform(({ event_type, price_changes, ...rest }) => {
    return {
      // Normalize to a consistent event envelope: `topic`, `type`, and `payload`.
      topic: 'market' as const,
      type: event_type,
      payload: {
        ...rest,
        priceChanges: price_changes,
      },
    };
  });

export type MarketPriceChangeEvent = z.infer<
  typeof MarketPriceChangeEventSchema
>;

export const MarketLastTradePriceEventSchema = z
  .object({
    event_type: z.literal('last_trade_price'),
    market: z.string(),
    asset_id: TokenIdSchema,
    price: DecimalStringSchema,
    size: OptionalDecimalStringSchema,
    fee_rate_bps: OptionalDecimalStringSchema,
    side: NormalizedOrderSideSchema,
    timestamp: EpochMillisecondsStringSchema.nullish(),
    transaction_hash: z.string().nullish(),
  })
  .transform(
    ({ event_type, asset_id, fee_rate_bps, transaction_hash, ...rest }) => {
      return {
        // Normalize to a consistent event envelope: `topic`, `type`, and `payload`.
        topic: 'market' as const,
        type: event_type,
        payload: {
          ...rest,
          tokenId: asset_id,
          feeRateBps: fee_rate_bps,
          transactionHash: transaction_hash,
        },
      };
    },
  );

export type MarketLastTradePriceEvent = z.infer<
  typeof MarketLastTradePriceEventSchema
>;

export const MarketTickSizeChangeEventSchema = z
  .object({
    event_type: z.literal('tick_size_change'),
    market: z.string(),
    asset_id: TokenIdSchema,
    old_tick_size: OptionalDecimalStringSchema,
    new_tick_size: DecimalStringSchema,
    timestamp: EpochMillisecondsStringSchema.nullish(),
  })
  .transform(
    ({ event_type, asset_id, old_tick_size, new_tick_size, ...rest }) => {
      return {
        // Normalize to a consistent event envelope: `topic`, `type`, and `payload`.
        topic: 'market' as const,
        type: event_type,
        payload: {
          ...rest,
          tokenId: asset_id,
          oldTickSize: old_tick_size,
          newTickSize: new_tick_size,
        },
      };
    },
  );

export type MarketTickSizeChangeEvent = z.infer<
  typeof MarketTickSizeChangeEventSchema
>;

export const MarketBestBidAskEventSchema = z
  .object({
    event_type: z.literal('best_bid_ask'),
    market: z.string(),
    asset_id: TokenIdSchema,
    best_bid: OptionalDecimalStringSchema,
    best_ask: OptionalDecimalStringSchema,
    spread: OptionalDecimalStringSchema,
    timestamp: EpochMillisecondsStringSchema.nullish(),
  })
  .transform(({ event_type, asset_id, best_bid, best_ask, ...rest }) => {
    return {
      // Normalize to a consistent event envelope: `topic`, `type`, and `payload`.
      topic: 'market' as const,
      type: event_type,
      payload: {
        ...rest,
        tokenId: asset_id,
        bestBid: best_bid,
        bestAsk: best_ask,
      },
    };
  });

export type MarketBestBidAskEvent = z.infer<typeof MarketBestBidAskEventSchema>;

const MarketEventMessageSchema = z.object({
  id: z.string(),
  ticker: z.string().nullish(),
  slug: z.string().nullish(),
  title: z.string().nullish(),
  description: z.string().nullish(),
});

export type MarketEventMessage = z.infer<typeof MarketEventMessageSchema>;

export const NewMarketEventSchema = z
  .object({
    event_type: z.literal('new_market'),
    id: z.string(),
    question: z.string().nullish(),
    market: z.string(),
    slug: z.string().nullish(),
    description: z.string().nullish(),
    assets_ids: z.array(TokenIdSchema).nullish(),
    outcomes: z.array(z.string()).nullish(),
    event_message: MarketEventMessageSchema.nullish(),
    timestamp: EpochMillisecondsStringSchema.nullish(),
    tags: z.array(z.string()).nullish(),
    condition_id: CtfConditionIdSchema.nullish(),
    active: z.boolean().nullish(),
    clob_token_ids: z.array(z.string()).nullish(),
    sports_market_type: z.string().nullish(),
    line: OptionalDecimalStringSchema,
    game_start_time: EpochMillisecondsToIsoDateTimeStringSchema.nullish(),
    order_price_min_tick_size: OptionalDecimalStringSchema,
    group_item_title: z.string().nullish(),
    taker_base_fee: OptionalDecimalStringSchema,
    fees_enabled: z.boolean().nullish(),
    fee_schedule: z.unknown().nullish(),
  })
  .transform(
    ({
      event_type,
      assets_ids,
      event_message,
      condition_id,
      clob_token_ids,
      sports_market_type,
      game_start_time,
      order_price_min_tick_size,
      group_item_title,
      taker_base_fee,
      fees_enabled,
      fee_schedule,
      ...rest
    }) => {
      return {
        // Normalize to a consistent event envelope: `topic`, `type`, and `payload`.
        topic: 'market' as const,
        type: event_type,
        payload: {
          ...rest,
          tokenIds: assets_ids,
          eventMessage: event_message,
          conditionId: condition_id,
          clobTokenIds: clob_token_ids,
          sportsMarketType: sports_market_type,
          gameStartTime: game_start_time,
          orderPriceMinTickSize: order_price_min_tick_size,
          groupItemTitle: group_item_title,
          takerBaseFee: taker_base_fee,
          feesEnabled: fees_enabled,
          feeSchedule: fee_schedule,
        },
      };
    },
  );

export type NewMarketEvent = z.infer<typeof NewMarketEventSchema>;

export const MarketResolvedEventSchema = z
  .object({
    event_type: z.literal('market_resolved'),
    id: z.string(),
    market: z.string(),
    assets_ids: z.array(TokenIdSchema).nullish(),
    winning_asset_id: TokenIdSchema.nullish(),
    winning_outcome: z.string().nullish(),
    event_message: MarketEventMessageSchema.nullish(),
    timestamp: EpochMillisecondsStringSchema.nullish(),
    tags: z.array(z.string()).nullish(),
  })
  .transform(
    ({
      event_type,
      assets_ids,
      winning_asset_id,
      winning_outcome,
      event_message,
      ...rest
    }) => {
      return {
        // Normalize to a consistent event envelope: `topic`, `type`, and `payload`.
        topic: 'market' as const,
        type: event_type,
        payload: {
          ...rest,
          tokenIds: assets_ids,
          winningTokenId: winning_asset_id,
          winningOutcome: winning_outcome,
          eventMessage: event_message,
        },
      };
    },
  );

export type MarketResolvedEvent = z.infer<typeof MarketResolvedEventSchema>;

export enum UserOrderEventType {
  Placement = 'PLACEMENT',
  Update = 'UPDATE',
  Cancellation = 'CANCELLATION',
}

const UserOrderEventTypeSchema = z.enum(UserOrderEventType);

export const UserOrderEventSchema = z
  .object({
    event_type: z.literal('order'),
    id: z.string(),
    owner: z.string(),
    market: z.string(),
    asset_id: TokenIdSchema,
    side: NormalizedOrderSideSchema,
    order_owner: z.string().nullish(),
    original_size: DecimalStringSchema,
    size_matched: DecimalStringSchema,
    price: DecimalStringSchema,
    associate_trades: z.array(z.string()).nullish(),
    outcome: z.string().nullish(),
    type: UserOrderEventTypeSchema,
    created_at: EpochSecondsStringToIsoDateTimeStringSchema.nullish(),
    expiration: ExpirationToIsoDateTimeStringSchema.nullish(),
    order_type: OrderTypeSchema.nullish(),
    status: UserOrderStatusSchema.nullish(),
    maker_address: z.string().nullish(),
    timestamp: EpochMillisecondsStringSchema,
  })
  .transform(
    ({
      event_type,
      type: orderEventType,
      asset_id,
      order_owner,
      original_size,
      size_matched,
      associate_trades,
      created_at,
      expiration,
      order_type,
      maker_address,
      ...rest
    }) => {
      return {
        // Normalize to a consistent event envelope: `topic`, `type`, and `payload`.
        topic: 'user' as const,
        type: event_type,
        payload: {
          ...rest,
          orderEventType,
          tokenId: asset_id,
          orderOwner: order_owner,
          originalSize: original_size,
          sizeMatched: size_matched,
          associateTrades: associate_trades,
          createdAt: created_at,
          expiresAt: expiration,
          orderType: order_type,
          makerAddress: maker_address,
        },
      };
    },
  );

export type UserOrderEvent = z.infer<typeof UserOrderEventSchema>;

const TradeMakerOrderSchema = z
  .object({
    order_id: z.string(),
    owner: z.string(),
    maker_address: z.string().nullish(),
    matched_amount: DecimalStringSchema,
    price: DecimalStringSchema,
    fee_rate_bps: OptionalDecimalStringSchema,
    asset_id: TokenIdSchema,
    outcome: z.string().nullish(),
    outcome_index: z.number().int().nullish(),
    side: NormalizedOrderSideSchema,
  })
  .transform(
    ({
      order_id,
      maker_address,
      matched_amount,
      fee_rate_bps,
      asset_id,
      outcome_index,
      ...rest
    }) => ({
      ...rest,
      orderId: order_id,
      makerAddress: maker_address,
      matchedAmount: matched_amount,
      feeRateBps: fee_rate_bps,
      tokenId: asset_id,
      outcomeIndex: outcome_index,
    }),
  );

export type TradeMakerOrder = z.infer<typeof TradeMakerOrderSchema>;

export const UserTradeEventSchema = z
  .object({
    event_type: z.literal('trade'),
    type: z.literal('TRADE'),
    id: z.string(),
    taker_order_id: z.string(),
    market: z.string(),
    asset_id: TokenIdSchema,
    side: NormalizedOrderSideSchema,
    size: DecimalStringSchema,
    fee_rate_bps: OptionalDecimalStringSchema,
    price: DecimalStringSchema,
    status: TradeStatusSchema,
    match_time: EpochSecondsStringToIsoDateTimeStringSchema.nullish(),
    matchtime: EpochSecondsStringToIsoDateTimeStringSchema.nullish(),
    last_update: EpochSecondsStringToIsoDateTimeStringSchema.nullish(),
    outcome: z.string().nullish(),
    owner: z.string(),
    trade_owner: z.string().nullish(),
    maker_address: z.string().nullish(),
    transaction_hash: z.string().nullish(),
    bucket_index: z.number().int().nullish(),
    maker_orders: z.array(TradeMakerOrderSchema).nullish(),
    trader_side: z.union([z.literal('TAKER'), z.literal('MAKER')]).nullish(),
    timestamp: EpochMillisecondsStringSchema,
  })
  .transform(
    ({
      event_type,
      type: _,
      taker_order_id,
      asset_id,
      fee_rate_bps,
      match_time,
      matchtime,
      last_update,
      trade_owner,
      maker_address,
      transaction_hash,
      bucket_index,
      maker_orders,
      trader_side,
      ...rest
    }) => {
      return {
        // Normalize to a consistent event envelope: `topic`, `type`, and `payload`.
        topic: 'user' as const,
        type: event_type,
        payload: {
          ...rest,
          takerOrderId: taker_order_id,
          tokenId: asset_id,
          feeRateBps: fee_rate_bps,
          matchedAt: match_time ?? matchtime,
          updatedAt: last_update,
          tradeOwner: trade_owner,
          makerAddress: maker_address,
          transactionHash: transaction_hash,
          bucketIndex: bucket_index,
          makerOrders: maker_orders,
          traderSide: trader_side,
        },
      };
    },
  );

export type UserTradeEvent = z.infer<typeof UserTradeEventSchema>;

export const StandardMarketEventSchema = z.discriminatedUnion('event_type', [
  MarketBookEventSchema,
  MarketPriceChangeEventSchema,
  MarketLastTradePriceEventSchema,
  MarketTickSizeChangeEventSchema,
]);

export type StandardMarketEvent = z.infer<typeof StandardMarketEventSchema>;

export const CustomMarketEventSchema = z.discriminatedUnion('event_type', [
  MarketBestBidAskEventSchema,
  NewMarketEventSchema,
  MarketResolvedEventSchema,
]);

export type CustomMarketEvent = z.infer<typeof CustomMarketEventSchema>;

export const MarketEventSchema = z.discriminatedUnion('event_type', [
  MarketBookEventSchema,
  MarketPriceChangeEventSchema,
  MarketLastTradePriceEventSchema,
  MarketTickSizeChangeEventSchema,
  MarketBestBidAskEventSchema,
  NewMarketEventSchema,
  MarketResolvedEventSchema,
]);

export type MarketEvent = StandardMarketEvent | CustomMarketEvent;

export const UserEventSchema = z.discriminatedUnion('event_type', [
  UserOrderEventSchema,
  UserTradeEventSchema,
]);

export type UserEvent = z.infer<typeof UserEventSchema>;
