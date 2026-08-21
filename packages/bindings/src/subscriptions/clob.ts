import { z } from 'zod';
import {
  ClobAssetIdSchema,
  type ConditionId,
  ConditionIdSchema,
  type DecimalString,
  DecimalStringSchema,
  type EpochMilliseconds,
  EpochMillisecondsStringSchema,
  EpochMillisecondsToIsoDateTimeStringSchema,
  type IsoDateTimeString,
  OptionalDecimalStringSchema,
  type OrderSide,
  OrderSideSchema,
  type OrderType,
  OrderTypeSchema,
  type PositionId,
  type TokenId,
  type TradeStatus,
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
    market: ConditionIdSchema,
    asset_id: ClobAssetIdSchema,
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
          conditionId: rest.market,
          market: rest.market,
          assetId: asset_id,
          tokenId: asset_id,
          minOrderSize: min_order_size,
          tickSize: tick_size,
          negRisk: neg_risk,
          lastTradePrice: last_trade_price,
        },
      };
    },
  ) satisfies z.ZodType<MarketBookEvent>;

export type MarketBookEvent = {
  topic: 'market';
  type: 'book';
  payload: {
    assetId: PositionId | TokenId;
    /** @deprecated Use `assetId`. */
    tokenId: PositionId | TokenId;
    conditionId: ConditionId;
    /** @deprecated Use `conditionId`. */
    market: ConditionId;
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
    hash?: string | null;
    timestamp?: EpochMilliseconds | null;
    minOrderSize: DecimalString | null | undefined;
    tickSize: DecimalString | null | undefined;
    negRisk: boolean | null | undefined;
    lastTradePrice: DecimalString | null | undefined;
  };
};

const PriceChangeSchema = z
  .object({
    asset_id: ClobAssetIdSchema,
    price: DecimalStringSchema,
    size: DecimalStringSchema,
    side: NormalizedOrderSideSchema,
    hash: z.string().nullish(),
    best_bid: OptionalDecimalStringSchema,
    best_ask: OptionalDecimalStringSchema,
  })
  .transform(({ asset_id, best_bid, best_ask, ...rest }) => ({
    ...rest,
    assetId: asset_id,
    tokenId: asset_id,
    bestBid: best_bid,
    bestAsk: best_ask,
  })) satisfies z.ZodType<PriceChange>;

export type PriceChange = {
  assetId: PositionId | TokenId;
  /** @deprecated Use `assetId`. */
  tokenId: PositionId | TokenId;
  price: DecimalString;
  size: DecimalString;
  side: OrderSide;
  hash?: string | null;
  bestBid: DecimalString | null | undefined;
  bestAsk: DecimalString | null | undefined;
};

export const MarketPriceChangeEventSchema = z
  .object({
    event_type: z.literal('price_change'),
    market: ConditionIdSchema,
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
        conditionId: rest.market,
        market: rest.market,
        priceChanges: price_changes,
      },
    };
  }) satisfies z.ZodType<MarketPriceChangeEvent>;

export type MarketPriceChangeEvent = {
  topic: 'market';
  type: 'price_change';
  payload: {
    conditionId: ConditionId;
    /** @deprecated Use `conditionId`. */
    market: ConditionId;
    priceChanges: PriceChange[];
    timestamp?: EpochMilliseconds | null;
  };
};

export const MarketLastTradePriceEventSchema = z
  .object({
    event_type: z.literal('last_trade_price'),
    market: ConditionIdSchema,
    asset_id: ClobAssetIdSchema,
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
          conditionId: rest.market,
          market: rest.market,
          assetId: asset_id,
          tokenId: asset_id,
          feeRateBps: fee_rate_bps,
          transactionHash: transaction_hash,
        },
      };
    },
  ) satisfies z.ZodType<MarketLastTradePriceEvent>;

export type MarketLastTradePriceEvent = {
  topic: 'market';
  type: 'last_trade_price';
  payload: {
    assetId: PositionId | TokenId;
    /** @deprecated Use `assetId`. */
    tokenId: PositionId | TokenId;
    conditionId: ConditionId;
    /** @deprecated Use `conditionId`. */
    market: ConditionId;
    price: DecimalString;
    side: OrderSide;
    size?: DecimalString | null;
    feeRateBps: DecimalString | null | undefined;
    timestamp?: EpochMilliseconds | null;
    transactionHash: string | null | undefined;
  };
};

export const MarketTickSizeChangeEventSchema = z
  .object({
    event_type: z.literal('tick_size_change'),
    market: ConditionIdSchema,
    asset_id: ClobAssetIdSchema,
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
          conditionId: rest.market,
          market: rest.market,
          assetId: asset_id,
          tokenId: asset_id,
          oldTickSize: old_tick_size,
          newTickSize: new_tick_size,
        },
      };
    },
  ) satisfies z.ZodType<MarketTickSizeChangeEvent>;

export type MarketTickSizeChangeEvent = {
  topic: 'market';
  type: 'tick_size_change';
  payload: {
    assetId: PositionId | TokenId;
    /** @deprecated Use `assetId`. */
    tokenId: PositionId | TokenId;
    conditionId: ConditionId;
    /** @deprecated Use `conditionId`. */
    market: ConditionId;
    oldTickSize: DecimalString | null | undefined;
    newTickSize: DecimalString;
    timestamp?: EpochMilliseconds | null;
  };
};

export const MarketBestBidAskEventSchema = z
  .object({
    event_type: z.literal('best_bid_ask'),
    market: ConditionIdSchema,
    asset_id: ClobAssetIdSchema,
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
        conditionId: rest.market,
        market: rest.market,
        assetId: asset_id,
        tokenId: asset_id,
        bestBid: best_bid,
        bestAsk: best_ask,
      },
    };
  }) satisfies z.ZodType<MarketBestBidAskEvent>;

export type MarketBestBidAskEvent = {
  topic: 'market';
  type: 'best_bid_ask';
  payload: {
    assetId: PositionId | TokenId;
    /** @deprecated Use `assetId`. */
    tokenId: PositionId | TokenId;
    conditionId: ConditionId;
    /** @deprecated Use `conditionId`. */
    market: ConditionId;
    bestBid: DecimalString | null | undefined;
    bestAsk: DecimalString | null | undefined;
    spread?: DecimalString | null;
    timestamp?: EpochMilliseconds | null;
  };
};

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
    assets_ids: z.array(ClobAssetIdSchema).nullish(),
    outcomes: z.array(z.string()).nullish(),
    event_message: MarketEventMessageSchema.nullish(),
    timestamp: EpochMillisecondsStringSchema.nullish(),
    tags: z.array(z.string()).nullish(),
    condition_id: ConditionIdSchema.nullish(),
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
          assetIds: assets_ids,
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
  ) satisfies z.ZodType<NewMarketEvent>;

export type NewMarketEvent = {
  topic: 'market';
  type: 'new_market';
  payload: {
    id: string;
    market: string;
    assetIds: Array<PositionId | TokenId> | null | undefined;
    /** @deprecated Use `assetIds`. */
    tokenIds: Array<PositionId | TokenId> | null | undefined;
    eventMessage: MarketEventMessage | null | undefined;
    conditionId: ConditionId | null | undefined;
    clobTokenIds: string[] | null | undefined;
    sportsMarketType: string | null | undefined;
    gameStartTime: IsoDateTimeString | null | undefined;
    orderPriceMinTickSize: DecimalString | null | undefined;
    groupItemTitle: string | null | undefined;
    takerBaseFee: DecimalString | null | undefined;
    feesEnabled: boolean | null | undefined;
    feeSchedule: unknown;
    question?: string | null;
    slug?: string | null;
    description?: string | null;
    outcomes?: string[] | null;
    timestamp?: EpochMilliseconds | null;
    tags?: string[] | null;
    active?: boolean | null;
    line?: DecimalString | null;
  };
};

export const MarketResolvedEventSchema = z
  .object({
    event_type: z.literal('market_resolved'),
    id: z.string(),
    market: ConditionIdSchema,
    assets_ids: z.array(ClobAssetIdSchema).nullish(),
    winning_asset_id: ClobAssetIdSchema.nullish(),
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
          conditionId: rest.market,
          market: rest.market,
          assetIds: assets_ids,
          tokenIds: assets_ids,
          winningAssetId: winning_asset_id,
          winningTokenId: winning_asset_id,
          winningOutcome: winning_outcome,
          eventMessage: event_message,
        },
      };
    },
  ) satisfies z.ZodType<MarketResolvedEvent>;

export type MarketResolvedEvent = {
  topic: 'market';
  type: 'market_resolved';
  payload: {
    id: string;
    conditionId: ConditionId;
    /** @deprecated Use `conditionId`. */
    market: ConditionId;
    assetIds: Array<PositionId | TokenId> | null | undefined;
    /** @deprecated Use `assetIds`. */
    tokenIds: Array<PositionId | TokenId> | null | undefined;
    winningAssetId: PositionId | TokenId | null | undefined;
    /** @deprecated Use `winningAssetId`. */
    winningTokenId: PositionId | TokenId | null | undefined;
    winningOutcome: string | null | undefined;
    eventMessage: MarketEventMessage | null | undefined;
    timestamp?: EpochMilliseconds | null;
    tags?: string[] | null;
  };
};

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
    market: ConditionIdSchema,
    asset_id: ClobAssetIdSchema,
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
          conditionId: rest.market,
          market: rest.market,
          orderEventType,
          assetId: asset_id,
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
  ) satisfies z.ZodType<UserOrderEvent>;

export type UserOrderEvent = {
  topic: 'user';
  type: 'order';
  payload: {
    id: string;
    owner: string;
    assetId: PositionId | TokenId;
    /** @deprecated Use `assetId`. */
    tokenId: PositionId | TokenId;
    conditionId: ConditionId;
    /** @deprecated Use `conditionId`. */
    market: ConditionId;
    side: OrderSide;
    orderOwner: string | null | undefined;
    originalSize: DecimalString;
    sizeMatched: DecimalString;
    price: DecimalString;
    associateTrades: string[] | null | undefined;
    outcome?: string | null;
    orderEventType: UserOrderEventType;
    createdAt: IsoDateTimeString | null | undefined;
    expiresAt: IsoDateTimeString | null | undefined;
    orderType: OrderType | null | undefined;
    status?: UserOrderStatus | null;
    makerAddress: string | null | undefined;
    timestamp: EpochMilliseconds;
  };
};

const TradeMakerOrderSchema = z
  .object({
    order_id: z.string(),
    owner: z.string(),
    maker_address: z.string().nullish(),
    matched_amount: DecimalStringSchema,
    price: DecimalStringSchema,
    fee_rate_bps: OptionalDecimalStringSchema,
    asset_id: ClobAssetIdSchema,
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
      assetId: asset_id,
      tokenId: asset_id,
      outcomeIndex: outcome_index,
    }),
  ) satisfies z.ZodType<TradeMakerOrder>;

export type TradeMakerOrder = {
  orderId: string;
  owner: string;
  assetId: PositionId | TokenId;
  /** @deprecated Use `assetId`. */
  tokenId: PositionId | TokenId;
  makerAddress: string | null | undefined;
  matchedAmount: DecimalString;
  price: DecimalString;
  feeRateBps: DecimalString | null | undefined;
  outcome?: string | null;
  outcomeIndex: number | null | undefined;
  side: OrderSide;
};

export const UserTradeEventSchema = z
  .object({
    event_type: z.literal('trade'),
    type: z.literal('TRADE'),
    id: z.string(),
    taker_order_id: z.string(),
    market: ConditionIdSchema,
    asset_id: ClobAssetIdSchema,
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
          conditionId: rest.market,
          market: rest.market,
          takerOrderId: taker_order_id,
          assetId: asset_id,
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
  ) satisfies z.ZodType<UserTradeEvent>;

export type UserTradeEvent = {
  topic: 'user';
  type: 'trade';
  payload: {
    id: string;
    takerOrderId: string;
    assetId: PositionId | TokenId;
    /** @deprecated Use `assetId`. */
    tokenId: PositionId | TokenId;
    conditionId: ConditionId;
    /** @deprecated Use `conditionId`. */
    market: ConditionId;
    side: OrderSide;
    size: DecimalString;
    feeRateBps: DecimalString | null | undefined;
    price: DecimalString;
    status: TradeStatus;
    matchedAt: IsoDateTimeString | null | undefined;
    updatedAt: IsoDateTimeString | null | undefined;
    outcome?: string | null;
    owner: string;
    tradeOwner: string | null | undefined;
    makerAddress: string | null | undefined;
    transactionHash: string | null | undefined;
    bucketIndex: number | null | undefined;
    makerOrders: TradeMakerOrder[] | null | undefined;
    traderSide: 'TAKER' | 'MAKER' | null | undefined;
    timestamp: EpochMilliseconds;
  };
};

export const StandardMarketEventSchema = z.discriminatedUnion('event_type', [
  MarketBookEventSchema,
  MarketPriceChangeEventSchema,
  MarketLastTradePriceEventSchema,
  MarketTickSizeChangeEventSchema,
]) satisfies z.ZodType<StandardMarketEvent>;

export type StandardMarketEvent =
  | MarketBookEvent
  | MarketPriceChangeEvent
  | MarketLastTradePriceEvent
  | MarketTickSizeChangeEvent;

export const CustomMarketEventSchema = z.discriminatedUnion('event_type', [
  MarketBestBidAskEventSchema,
  NewMarketEventSchema,
  MarketResolvedEventSchema,
]) satisfies z.ZodType<CustomMarketEvent>;

export type CustomMarketEvent =
  | MarketBestBidAskEvent
  | NewMarketEvent
  | MarketResolvedEvent;

export const MarketEventSchema = z.discriminatedUnion('event_type', [
  MarketBookEventSchema,
  MarketPriceChangeEventSchema,
  MarketLastTradePriceEventSchema,
  MarketTickSizeChangeEventSchema,
  MarketBestBidAskEventSchema,
  NewMarketEventSchema,
  MarketResolvedEventSchema,
]) satisfies z.ZodType<MarketEvent>;

export type MarketEvent = StandardMarketEvent | CustomMarketEvent;

export const UserEventSchema = z.discriminatedUnion('event_type', [
  UserOrderEventSchema,
  UserTradeEventSchema,
]) satisfies z.ZodType<UserEvent>;

export type UserEvent = UserOrderEvent | UserTradeEvent;
