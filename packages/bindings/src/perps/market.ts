import { z } from 'zod';
import {
  type DecimalString,
  DecimalStringSchema,
  EpochMillisecondsSchema,
} from '../shared';
import {
  PerpsAssetSchema,
  PerpsDataResponseSchema,
  PerpsFundingIntervalSchema,
  PerpsInstrumentCategorySchema,
  PerpsInstrumentIdSchema,
  PerpsInstrumentTypeSchema,
  PerpsSideSchema,
  PerpsTradeIdSchema,
  PerpsTxHashSchema,
} from './common';

export {
  type PerpsFundingInterval,
  PerpsFundingIntervalSchema,
} from './common';

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsRiskTierSchema = z.object({
  lowerBound: DecimalStringSchema,
  maxLeverage: z.number().int().positive(),
});

const RawPerpsRiskTierSchema = z
  .object({
    lower_bound: DecimalStringSchema,
    max_leverage: z.number().int().positive(),
  })
  .transform((tier) => ({
    lowerBound: tier.lower_bound,
    maxLeverage: tier.max_leverage,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsRiskTier = z.infer<typeof PerpsRiskTierSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsInstrumentSchema = z
  .object({
    instrument_id: PerpsInstrumentIdSchema,
    instrument_type: PerpsInstrumentTypeSchema,
    category: PerpsInstrumentCategorySchema,
    symbol: z.string().min(1),
    base_asset: PerpsAssetSchema,
    quote_asset: PerpsAssetSchema,
    funding_interval: PerpsFundingIntervalSchema,
    quantity_decimals: z.number().int().nonnegative(),
    price_decimals: z.number().int().nonnegative(),
    price_bounds: DecimalStringSchema,
    liquidation_fee: DecimalStringSchema,
    max_order_count: z.number().int().positive(),
    min_notional: DecimalStringSchema,
    max_market_notional: DecimalStringSchema,
    max_limit_notional: DecimalStringSchema,
    max_leverage: z.number().int().positive(),
    isolated_only: z.boolean(),
    risk_tiers: z.array(RawPerpsRiskTierSchema),
  })
  .transform((instrument) => ({
    id: instrument.instrument_id,
    category: instrument.category,
    symbol: instrument.symbol,
    baseAsset: instrument.base_asset,
    quoteAsset: instrument.quote_asset,
    fundingInterval: instrument.funding_interval,
    quantityDecimals: instrument.quantity_decimals,
    priceDecimals: instrument.price_decimals,
    priceBounds: instrument.price_bounds,
    liquidationFee: instrument.liquidation_fee,
    maxOrderCount: instrument.max_order_count,
    minNotional: instrument.min_notional,
    maxMarketNotional: instrument.max_market_notional,
    maxLimitNotional: instrument.max_limit_notional,
    maxLeverage: instrument.max_leverage,
    isolatedOnly: instrument.isolated_only,
    riskTiers: instrument.risk_tiers,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsInstrument = z.infer<typeof PerpsInstrumentSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsInstrumentsResponseSchema = z.array(
  PerpsInstrumentSchema,
);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsTickerSchema = z
  .object({
    instrument_id: PerpsInstrumentIdSchema,
    symbol: z.string().min(1),
    index_price: DecimalStringSchema,
    mark_price: DecimalStringSchema,
    last_price: DecimalStringSchema,
    mid_price: DecimalStringSchema,
    open_interest: DecimalStringSchema,
    funding_rate: DecimalStringSchema,
    next_funding: EpochMillisecondsSchema,
    timestamp: EpochMillisecondsSchema.optional(),
  })
  .transform((ticker) => ({
    instrumentId: ticker.instrument_id,
    symbol: ticker.symbol,
    indexPrice: ticker.index_price,
    markPrice: ticker.mark_price,
    lastPrice: ticker.last_price,
    midPrice: ticker.mid_price,
    openInterest: ticker.open_interest,
    fundingRate: ticker.funding_rate,
    nextFunding: ticker.next_funding,
    timestamp: ticker.timestamp,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsTicker = z.infer<typeof PerpsTickerSchema> & {
  openPrice?: DecimalString;
  volume24h?: DecimalString;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsTickersResponseSchema = z.array(PerpsTickerSchema);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsTickerEntrySchema = z
  .object({
    iid: PerpsInstrumentIdSchema,
    idx: DecimalStringSchema,
    mark: DecimalStringSchema,
    last: DecimalStringSchema,
    mid: DecimalStringSchema,
    oi: DecimalStringSchema,
    fr: DecimalStringSchema,
    nxf: EpochMillisecondsSchema,
  })
  .transform((ticker) => ({
    instrumentId: ticker.iid,
    indexPrice: ticker.idx,
    markPrice: ticker.mark,
    lastPrice: ticker.last,
    midPrice: ticker.mid,
    openInterest: ticker.oi,
    fundingRate: ticker.fr,
    nextFunding: ticker.nxf,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsCandleSchema = z
  .tuple([
    EpochMillisecondsSchema,
    DecimalStringSchema,
    DecimalStringSchema,
    DecimalStringSchema,
    DecimalStringSchema,
    DecimalStringSchema,
    z.number().int().nonnegative(),
  ])
  .transform(([timestamp, open, high, low, close, volume, trades]) => ({
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    trades,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsCandle = z.infer<typeof PerpsCandleSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsStatisticSchema = z
  .object({
    instrument_id: PerpsInstrumentIdSchema,
    symbol: z.string().min(1).optional(),
    volume: DecimalStringSchema,
    open_price: DecimalStringSchema,
    klines: z.array(PerpsCandleSchema),
  })
  .transform((statistic) => ({
    instrumentId: statistic.instrument_id,
    symbol: statistic.symbol,
    volume: statistic.volume,
    openPrice: statistic.open_price,
    klines: statistic.klines,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsStatistic = z.infer<typeof PerpsStatisticSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsStatisticsResponseSchema = z.array(PerpsStatisticSchema);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsStatisticUpdateSchema = z
  .object({
    iid: PerpsInstrumentIdSchema,
    vol: DecimalStringSchema,
    open: DecimalStringSchema,
    klines: z.array(PerpsCandleSchema),
  })
  .transform((statistic) => ({
    instrumentId: statistic.iid,
    volume: statistic.vol,
    openPrice: statistic.open,
    klines: statistic.klines,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsBookLevelSchema = z
  .tuple([DecimalStringSchema, DecimalStringSchema])
  .transform(([price, quantity]) => ({ price, quantity }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsBookLevel = z.infer<typeof PerpsBookLevelSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsBookSchema = z
  .object({
    instrument_id: PerpsInstrumentIdSchema,
    bids: z.array(PerpsBookLevelSchema),
    asks: z.array(PerpsBookLevelSchema),
    timestamp: EpochMillisecondsSchema,
    sequence: z.number().int().nonnegative(),
  })
  .transform((book) => ({
    instrumentId: book.instrument_id,
    bids: book.bids,
    asks: book.asks,
    timestamp: book.timestamp,
    sequence: book.sequence,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsBook = z.infer<typeof PerpsBookSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsBookUpdateSchema = z
  .object({
    b: z.array(PerpsBookLevelSchema),
    a: z.array(PerpsBookLevelSchema),
  })
  .transform((book) => ({
    bids: book.b,
    asks: book.a,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsBboSchema = z.object({
  instrumentId: PerpsInstrumentIdSchema,
  bidPrice: DecimalStringSchema,
  bidQuantity: DecimalStringSchema,
  askPrice: DecimalStringSchema,
  askQuantity: DecimalStringSchema,
  timestamp: EpochMillisecondsSchema.optional(),
});

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsBbo = z.infer<typeof PerpsBboSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsBboUpdateSchema = z
  .object({
    iid: PerpsInstrumentIdSchema,
    bp: DecimalStringSchema,
    bq: DecimalStringSchema,
    ap: DecimalStringSchema,
    aq: DecimalStringSchema,
  })
  .transform((bbo) => ({
    instrumentId: bbo.iid,
    bidPrice: bbo.bp,
    bidQuantity: bbo.bq,
    askPrice: bbo.ap,
    askQuantity: bbo.aq,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsPublicTradeSchema = z
  .object({
    trade_id: PerpsTradeIdSchema,
    instrument_id: PerpsInstrumentIdSchema,
    side: PerpsSideSchema,
    price: DecimalStringSchema,
    quantity: DecimalStringSchema,
    timestamp: EpochMillisecondsSchema,
    hash: PerpsTxHashSchema,
  })
  .transform((trade) => ({
    tradeId: trade.trade_id,
    instrumentId: trade.instrument_id,
    side: trade.side,
    price: trade.price,
    quantity: trade.quantity,
    timestamp: trade.timestamp,
    hash: trade.hash,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPublicTrade = z.infer<typeof PerpsPublicTradeSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsPublicTradeUpdateSchema = z
  .object({
    tid: PerpsTradeIdSchema,
    iid: PerpsInstrumentIdSchema,
    side: PerpsSideSchema,
    p: DecimalStringSchema,
    qty: DecimalStringSchema,
    ts: EpochMillisecondsSchema,
    hash: PerpsTxHashSchema,
  })
  .transform((trade) => ({
    tradeId: trade.tid,
    instrumentId: trade.iid,
    side: trade.side,
    price: trade.p,
    quantity: trade.qty,
    timestamp: trade.ts,
    hash: trade.hash,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsTradesResponseSchema = PerpsDataResponseSchema(
  PerpsPublicTradeSchema,
);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsFundingRateSchema = z
  .object({
    funding_rate: DecimalStringSchema,
    timestamp: EpochMillisecondsSchema,
  })
  .transform((funding) => ({
    fundingRate: funding.funding_rate,
    timestamp: funding.timestamp,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsFundingRate = z.infer<typeof PerpsFundingRateSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsFundingHistoryResponseSchema = PerpsDataResponseSchema(
  PerpsFundingRateSchema,
);

export const PerpsFeeTierSchema = z
  .object({
    min_volume_30d: DecimalStringSchema,
    taker_fee_rate: DecimalStringSchema,
    maker_fee_rate: DecimalStringSchema,
  })
  .transform((tier) => ({
    minVolume30d: tier.min_volume_30d,
    takerFeeRate: tier.taker_fee_rate,
    makerFeeRate: tier.maker_fee_rate,
  }));

export type PerpsFeeTier = z.infer<typeof PerpsFeeTierSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsFeeScheduleEntrySchema = z
  .object({
    instrument_type: PerpsInstrumentTypeSchema,
    category: PerpsInstrumentCategorySchema,
    taker_fee_rate: DecimalStringSchema,
    maker_fee_rate: DecimalStringSchema,
    tiers: z.array(PerpsFeeTierSchema),
  })
  .transform((fee) => ({
    category: fee.category,
    takerFeeRate: fee.taker_fee_rate,
    makerFeeRate: fee.maker_fee_rate,
    tiers: fee.tiers,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsFeeScheduleEntry = z.infer<typeof PerpsFeeScheduleEntrySchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsFeesInfoSchema = z
  .object({
    fee_schedule: z.array(PerpsFeeScheduleEntrySchema),
  })
  .transform((fees) => ({
    feeSchedule: fees.fee_schedule,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsFeesInfo = z.infer<typeof PerpsFeesInfoSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsFeesResponseSchema = PerpsFeesInfoSchema;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsCandlesResponseSchema =
  PerpsDataResponseSchema(PerpsCandleSchema);
