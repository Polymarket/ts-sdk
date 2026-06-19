import { z } from 'zod';
import {
  DecimalStringSchema,
  EpochMillisecondsSchema,
  TxHashSchema,
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
  RawPerpsTxHashSchema,
} from './common';

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

export type PerpsRiskTier = z.infer<typeof PerpsRiskTierSchema>;

export const PerpsInstrumentSchema = z.object({
  id: PerpsInstrumentIdSchema,
  category: PerpsInstrumentCategorySchema,
  symbol: z.string().min(1),
  baseAsset: PerpsAssetSchema,
  quoteAsset: PerpsAssetSchema,
  fundingInterval: PerpsFundingIntervalSchema,
  quantityDecimals: z.number().int().nonnegative(),
  priceDecimals: z.number().int().nonnegative(),
  priceBounds: DecimalStringSchema,
  liquidationFee: DecimalStringSchema,
  maxOrderCount: z.number().int().positive(),
  minNotional: DecimalStringSchema,
  maxMarketNotional: DecimalStringSchema,
  maxLimitNotional: DecimalStringSchema,
  maxLeverage: z.number().int().positive(),
  riskTiers: z.array(PerpsRiskTierSchema),
});

export type PerpsInstrument = z.infer<typeof PerpsInstrumentSchema>;

export const RawPerpsInstrumentSchema = z
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
    riskTiers: instrument.risk_tiers,
  }));

export const FetchPerpsInstrumentsResponseSchema = z.array(
  RawPerpsInstrumentSchema,
);

export const PerpsTickerSchema = z.object({
  instrumentId: PerpsInstrumentIdSchema,
  symbol: z.string().min(1),
  indexPrice: DecimalStringSchema,
  markPrice: DecimalStringSchema,
  lastPrice: DecimalStringSchema,
  midPrice: DecimalStringSchema,
  openInterest: DecimalStringSchema,
  fundingRate: DecimalStringSchema,
  nextFunding: EpochMillisecondsSchema,
  volume24h: DecimalStringSchema.optional(),
  openPrice: DecimalStringSchema.optional(),
  timestamp: EpochMillisecondsSchema.optional(),
});

export type PerpsTicker = z.infer<typeof PerpsTickerSchema>;

export const RawPerpsTickerSchema = z
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

export const FetchPerpsTickersResponseSchema = z.array(RawPerpsTickerSchema);

export const RawPerpsTickerEntrySchema = z
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

export type PerpsCandle = z.infer<typeof PerpsCandleSchema>;

export const PerpsStatisticSchema = z.object({
  instrumentId: PerpsInstrumentIdSchema,
  symbol: z.string().min(1).optional(),
  volume: DecimalStringSchema,
  openPrice: DecimalStringSchema,
  klines: z.array(PerpsCandleSchema),
});

export type PerpsStatistic = z.infer<typeof PerpsStatisticSchema>;

export const RawPerpsStatisticSchema = z
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

export const FetchPerpsStatisticsResponseSchema = z.array(
  RawPerpsStatisticSchema,
);

export const RawPerpsStatisticDataSchema = z
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

export const PerpsBookLevelSchema = z
  .tuple([DecimalStringSchema, DecimalStringSchema])
  .transform(([price, quantity]) => ({ price, quantity }));

export type PerpsBookLevel = z.infer<typeof PerpsBookLevelSchema>;

export const PerpsBookSchema = z.object({
  instrumentId: PerpsInstrumentIdSchema,
  bids: z.array(PerpsBookLevelSchema),
  asks: z.array(PerpsBookLevelSchema),
  timestamp: EpochMillisecondsSchema,
  sequence: z.number().int().nonnegative(),
});

export type PerpsBook = z.infer<typeof PerpsBookSchema>;

export const RawPerpsBookSchema = z
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

export const RawPerpsBookUpdateSchema = z
  .object({
    b: z.array(PerpsBookLevelSchema),
    a: z.array(PerpsBookLevelSchema),
  })
  .transform((book) => ({
    bids: book.b,
    asks: book.a,
  }));

export const PerpsBboSchema = z.object({
  instrumentId: PerpsInstrumentIdSchema,
  bidPrice: DecimalStringSchema,
  bidQuantity: DecimalStringSchema,
  askPrice: DecimalStringSchema,
  askQuantity: DecimalStringSchema,
  timestamp: EpochMillisecondsSchema.optional(),
});

export type PerpsBbo = z.infer<typeof PerpsBboSchema>;

export const RawPerpsBboSchema = z
  .object({
    instrument_id: PerpsInstrumentIdSchema,
    bid_price: DecimalStringSchema,
    bid_quantity: DecimalStringSchema,
    ask_price: DecimalStringSchema,
    ask_quantity: DecimalStringSchema,
    timestamp: EpochMillisecondsSchema.optional(),
  })
  .transform((bbo) => ({
    instrumentId: bbo.instrument_id,
    bidPrice: bbo.bid_price,
    bidQuantity: bbo.bid_quantity,
    askPrice: bbo.ask_price,
    askQuantity: bbo.ask_quantity,
    timestamp: bbo.timestamp,
  }));

export const RawPerpsBboDataSchema = z
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

export const PerpsPublicTradeSchema = z.object({
  tradeId: PerpsTradeIdSchema,
  instrumentId: PerpsInstrumentIdSchema,
  side: PerpsSideSchema,
  price: DecimalStringSchema,
  quantity: DecimalStringSchema,
  timestamp: EpochMillisecondsSchema,
  hash: TxHashSchema.optional(),
});

export type PerpsPublicTrade = z.infer<typeof PerpsPublicTradeSchema>;

export const RawPerpsPublicTradeSchema = z
  .object({
    trade_id: PerpsTradeIdSchema,
    instrument_id: PerpsInstrumentIdSchema,
    side: PerpsSideSchema,
    price: DecimalStringSchema,
    quantity: DecimalStringSchema,
    timestamp: EpochMillisecondsSchema,
    hash: RawPerpsTxHashSchema,
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

export const RawPerpsPublicTradeResponseSchema = z
  .object({
    tid: PerpsTradeIdSchema,
    iid: PerpsInstrumentIdSchema,
    side: PerpsSideSchema,
    p: DecimalStringSchema,
    qty: DecimalStringSchema,
    ts: EpochMillisecondsSchema,
    hash: RawPerpsTxHashSchema,
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

export const FetchPerpsTradesResponseSchema = PerpsDataResponseSchema(
  RawPerpsPublicTradeSchema,
);

export const PerpsFundingRateSchema = z.object({
  fundingRate: DecimalStringSchema,
  timestamp: EpochMillisecondsSchema,
});

export type PerpsFundingRate = z.infer<typeof PerpsFundingRateSchema>;

export const RawPerpsFundingRateSchema = z
  .object({
    funding_rate: DecimalStringSchema,
    timestamp: EpochMillisecondsSchema,
  })
  .transform((funding) => ({
    fundingRate: funding.funding_rate,
    timestamp: funding.timestamp,
  }));

export const FetchPerpsFundingHistoryResponseSchema = PerpsDataResponseSchema(
  RawPerpsFundingRateSchema,
);

export const PerpsFeeScheduleEntrySchema = z.object({
  instrumentType: PerpsInstrumentTypeSchema,
  category: PerpsInstrumentCategorySchema,
  takerFeeRate: DecimalStringSchema,
  makerFeeRate: DecimalStringSchema,
});

export type PerpsFeeScheduleEntry = z.infer<typeof PerpsFeeScheduleEntrySchema>;

export const RawPerpsFeeScheduleEntrySchema = z
  .object({
    instrument_type: PerpsInstrumentTypeSchema,
    category: PerpsInstrumentCategorySchema,
    taker_fee_rate: DecimalStringSchema,
    maker_fee_rate: DecimalStringSchema,
  })
  .transform((fee) => ({
    instrumentType: fee.instrument_type,
    category: fee.category,
    takerFeeRate: fee.taker_fee_rate,
    makerFeeRate: fee.maker_fee_rate,
  }));

export const PerpsFeesInfoSchema = z.object({
  feeSchedule: z.array(PerpsFeeScheduleEntrySchema),
});

export type PerpsFeesInfo = z.infer<typeof PerpsFeesInfoSchema>;

export const FetchPerpsFeesResponseSchema = z
  .object({
    fee_schedule: z.array(RawPerpsFeeScheduleEntrySchema),
  })
  .transform((fees) => ({
    feeSchedule: fees.fee_schedule,
  }));

export const FetchPerpsCandlesResponseSchema =
  PerpsDataResponseSchema(PerpsCandleSchema);
