import { z } from 'zod';
import {
  type DecimalString,
  DecimalStringSchema,
  type EpochMilliseconds,
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
 * Permanent retirement record. Sequence is an exact nonnegative safe integer;
 * larger values are rejected. Timestamp is the cutoff for unapplied funding.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsInstrumentSettlement = {
  sequence: number;
  timestamp: EpochMilliseconds;
  price: DecimalString;
  insuranceDebit: DecimalString;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsInstrumentSettlementSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    timestamp: EpochMillisecondsSchema,
    price: DecimalStringSchema,
    insurance_debit: DecimalStringSchema,
  })
  .transform(
    (settlement): PerpsInstrumentSettlement => ({
      sequence: settlement.sequence,
      timestamp: settlement.timestamp,
      price: settlement.price,
      insuranceDebit: settlement.insurance_debit,
    }),
  );

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsInstrumentSchema = z
  .object({
    instrument_id: PerpsInstrumentIdSchema,
    instrument_type: PerpsInstrumentTypeSchema,
    category: PerpsInstrumentCategorySchema,
    symbol: z.string().min(1),
    display_symbol: z.string().optional(),
    close_only: z.boolean().default(false),
    settlement: PerpsInstrumentSettlementSchema.optional(),
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
    ui_live_time: z
      .number()
      .int()
      .min(0)
      .max(253_402_300_799_000)
      .pipe(EpochMillisecondsSchema)
      .nullable(),
    logo: z.object({ light: z.string(), dark: z.string() }).optional(),
  })
  .transform((instrument) => ({
    id: instrument.instrument_id,
    category: instrument.category,
    symbol: instrument.symbol,
    /** Presentation label; canonical symbol and instrument ID remain unchanged. */
    displaySymbol: instrument.display_symbol,
    /** Whether new orders must reduce exposure; false for older responses. */
    closeOnly: instrument.close_only,
    /** Present after permanent retirement; trading cannot resume. */
    settlement: instrument.settlement,
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
    /** Advisory visibility time; null means hidden. Does not restrict trading. */
    uiLiveTime: instrument.ui_live_time,
    /** Immutable logo URLs for light and dark themes; absent until uploaded. */
    logo: instrument.logo,
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
 * Known pricing modes for a Perps instrument.
 *
 * {@link PerpsKnownPricingMode.External} is normal pricing. The service evolves
 * this set independently of released clients, so ticker parsing accepts
 * unknown modes as plain strings; see {@link PerpsPricingMode}. Treat any
 * mode other than {@link PerpsKnownPricingMode.External}, including unknown
 * modes, as non-normal pricing.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsKnownPricingMode {
  External = 'external',
  Hold = 'hold',
  Internal = 'internal',
  Frozen = 'frozen',
  Bounded = 'bounded',
  RecoveryPending = 'recovery_pending',
}

/**
 * A Perps pricing mode. Known modes are enumerated in
 * {@link PerpsKnownPricingMode}; newly introduced modes flow through as plain
 * strings so they can be handled before a client release that enumerates
 * them.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPricingMode = PerpsKnownPricingMode | (string & {});

/**
 * Known reasons for the current pricing mode of a Perps instrument.
 *
 * The service evolves this set independently of released clients, so ticker
 * parsing accepts unknown reasons as plain strings; see
 * {@link PerpsPricingReason}.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsKnownPricingReason {
  ExternalAvailable = 'external_available',
  AllSourcesUnavailable = 'all_sources_unavailable',
  ActivationDelay = 'activation_delay',
  MissingOracleConfiguration = 'missing_oracle_configuration',
  SourceDisagreement = 'source_disagreement',
  UnknownSourceState = 'unknown_source_state',
  ExplicitHalt = 'explicit_halt',
  Disabled = 'disabled',
  ProcessDisabled = 'process_disabled',
  ManualFreeze = 'manual_freeze',
  InsufficientBidDepth = 'insufficient_bid_depth',
  InsufficientAskDepth = 'insufficient_ask_depth',
  InvalidBook = 'invalid_book',
  ImpactSpreadTooWide = 'impact_spread_too_wide',
  InvalidPrecision = 'invalid_precision',
  ArithmeticFailure = 'arithmetic_failure',
  SessionBound = 'session_bound',
  RecoveryConfirmation = 'recovery_confirmation',
  MaterialRecoveryGap = 'material_recovery_gap',
}

/**
 * A reason for a Perps pricing mode. Known reasons are enumerated in
 * {@link PerpsKnownPricingReason}; newly introduced reasons flow through as
 * plain strings so they can be handled before a client release that
 * enumerates them.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPricingReason = PerpsKnownPricingReason | (string & {});

/**
 * Known sources of the retained index price of a Perps instrument.
 *
 * The service evolves this set independently of released clients, so ticker
 * parsing accepts unknown sources as plain strings; see
 * {@link PerpsPricingIndexSource}.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsKnownPricingIndexSource {
  Unknown = 'unknown',
  External = 'external',
  Internal = 'internal',
}

/**
 * A source of the retained Perps index price. Known sources are enumerated in
 * {@link PerpsKnownPricingIndexSource}; newly introduced sources flow through
 * as plain strings so they can be handled before a client release that
 * enumerates them.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPricingIndexSource =
  | PerpsKnownPricingIndexSource
  | (string & {});

/**
 * Pricing safety state of a Perps instrument. A missing status does not imply
 * external pricing.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPricingStatus = {
  /**
   * Pricing mode in effect. {@link PerpsKnownPricingMode.External} is normal
   * pricing; treat any other value, including modes not enumerated in
   * {@link PerpsKnownPricingMode}, as non-normal pricing.
   */
  mode: PerpsPricingMode;
  /** Reason for the current pricing mode. */
  reason: PerpsPricingReason;
  /** Source of the retained index price, independent of the pricing mode. */
  indexSource: PerpsPricingIndexSource;
  /**
   * Anchor price reported for the current pricing state, or `null` when none
   * is reported.
   */
  anchorPrice: DecimalString | null;
  /** Time associated with `anchorPrice`, or `null` when none is reported. */
  anchorTimestamp: EpochMilliseconds | null;
  /** Time the retained index price was observed, or `null` when unknown. */
  indexObservedTimestamp: EpochMilliseconds | null;
  /** Time the pricing state last changed. */
  stateChangedTimestamp: EpochMilliseconds;
  /**
   * Whether the current pricing state reports a no-increase exposure
   * restriction.
   */
  noIncrease: boolean;
  /**
   * Whether the current pricing state reports the price at its lower bound.
   */
  atLowerBound: boolean;
  /**
   * Whether the current pricing state reports the price at its upper bound.
   */
  atUpperBound: boolean;
};

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsPricingStatusSchema = z
  .object({
    mode: z.string().transform((value): PerpsPricingMode => value),
    reason: z.string().transform((value): PerpsPricingReason => value),
    index_source: z
      .string()
      .transform((value): PerpsPricingIndexSource => value),
    anchor_price: DecimalStringSchema.nullable(),
    anchor_timestamp: EpochMillisecondsSchema.nullable(),
    index_observed_timestamp: EpochMillisecondsSchema.nullable(),
    state_changed_timestamp: EpochMillisecondsSchema,
    no_increase: z.boolean(),
    at_lower_bound: z.boolean(),
    at_upper_bound: z.boolean(),
  })
  .transform(
    (status): PerpsPricingStatus => ({
      mode: status.mode,
      reason: status.reason,
      indexSource: status.index_source,
      anchorPrice: status.anchor_price,
      anchorTimestamp: status.anchor_timestamp,
      indexObservedTimestamp: status.index_observed_timestamp,
      stateChangedTimestamp: status.state_changed_timestamp,
      noIncrease: status.no_increase,
      atLowerBound: status.at_lower_bound,
      atUpperBound: status.at_upper_bound,
    }),
  );

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsTickerSchema = z
  .object({
    instrument_id: PerpsInstrumentIdSchema,
    symbol: z.string().min(1),
    index_price: DecimalStringSchema,
    pricing_status: PerpsPricingStatusSchema.nullish(),
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
    /**
     * Pricing safety state, or `undefined` when not reported. A missing status
     * does not imply external pricing.
     */
    pricingStatus: ticker.pricing_status ?? undefined,
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
    // Unlike the abbreviated keys around it, the stream carries this field
    // under its full `pricing_status` key, the same key as the REST ticker.
    // No captured stream frame in this repository confirms that key yet.
    pricing_status: PerpsPricingStatusSchema.nullish(),
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
    /**
     * Pricing safety state, or `undefined` when not reported. A missing status
     * does not imply external pricing.
     */
    pricingStatus: ticker.pricing_status ?? undefined,
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
    settlement: z.boolean().default(false),
    price: DecimalStringSchema,
    quantity: DecimalStringSchema,
    timestamp: EpochMillisecondsSchema,
    hash: PerpsTxHashSchema,
  })
  .transform((trade) => ({
    tradeId: trade.trade_id,
    instrumentId: trade.instrument_id,
    side: trade.side,
    /** True for a position close at instrument settlement; false on older responses. */
    settlement: trade.settlement,
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
    settlement: z.boolean().default(false),
    p: DecimalStringSchema,
    qty: DecimalStringSchema,
    ts: EpochMillisecondsSchema,
    hash: PerpsTxHashSchema,
  })
  .transform((trade) => ({
    tradeId: trade.tid,
    instrumentId: trade.iid,
    side: trade.side,
    /** True for a position close at instrument settlement; false on older responses. */
    settlement: trade.settlement,
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
