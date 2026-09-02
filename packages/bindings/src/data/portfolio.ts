import type { EvmAddress } from '@polymarket/types';
import { z } from 'zod';
import {
  ClobAssetIdSchema,
  ComboConditionIdSchema,
  type ConditionId,
  ConditionIdSchema,
  DecimalishSchema,
  type DecimalString,
  type EpochMilliseconds,
  EpochSecondsToMillisecondsSchema,
  EvmAddressSchema,
  type IsoCalendarDateString,
  IsoCalendarDateStringSchema,
  IsoDateTimeStringSchema,
  type PositionId,
  PositionIdSchema,
  type TokenId,
} from '../shared';
import { dataEnvelopeSchema, dataPageSchema } from './envelope';

export enum ComboPositionStatus {
  Open = 'OPEN',
  Redeemable = 'REDEEMABLE',
  Partial = 'PARTIAL',
  ResolvedPartial = 'RESOLVED_PARTIAL',
  ResolvedWin = 'RESOLVED_WIN',
  ResolvedLoss = 'RESOLVED_LOSS',
}

export const ComboPositionStatusSchema = z.enum(ComboPositionStatus);

export enum PositionStatus {
  Open = 'OPEN',
  Redeemable = 'REDEEMABLE',
  Closed = 'CLOSED',
}

export const PositionStatusSchema = z.enum(PositionStatus);

/** Sort key for position listings. */
export enum PositionSortBy {
  CurrentValue = 'CURRENT_VALUE',
  Tokens = 'TOKENS',
  UnrealizedPnl = 'UNREALIZED_PNL',
  RealizedPnl = 'REALIZED_PNL',
  TotalPnl = 'TOTAL_PNL',
  Timestamp = 'TIMESTAMP',
}

export const PositionSortBySchema = z.enum(PositionSortBy);

/** Unit the positions dust filter applies to. */
export enum PositionFilterType {
  Cash = 'CASH',
  Tokens = 'TOKENS',
}

export const PositionFilterTypeSchema = z.enum(PositionFilterType);

/** Sort key for combo position listings. */
export enum ComboPositionSortBy {
  FirstEntry = 'FIRST_ENTRY',
  EntryCost = 'ENTRY_COST',
  CurrentValue = 'CURRENT_VALUE',
  Updated = 'UPDATED',
}

export const ComboPositionSortBySchema = z.enum(ComboPositionSortBy);

const OptionalTextSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

const UnknownOutcomeIndexToUndefinedSchema = z.preprocess(
  (value) => (value === 999 ? undefined : value),
  z.number().int().optional(),
);

export type Position = {
  wallet: EvmAddress;
  /** Outcome identifier for a CTF token or Polymarket V2 position. */
  assetId: TokenId | PositionId;
  /** @deprecated Use `assetId`. */
  tokenId: TokenId | PositionId;
  conditionId: ConditionId;
  /** The current holding, in shares (a ~0 residual on CLOSED rows). */
  currentSize: DecimalString;
  avgPrice: DecimalString;
  /** The fee-exclusive entry basis in USD. */
  entryCostUsdc: DecimalString;
  /**
   * Attributed BUY-fee total in USD. Disclosure only — `entryCostUsdc` is
   * already fee-exclusive, so never re-deduct this from a PnL figure.
   */
  entryFeesUsdc: DecimalString;
  /** Gross (fee-inclusive) basis: always `entryCostUsdc + entryFeesUsdc`. */
  totalCostUsdc: DecimalString;
  currentPrice: DecimalString;
  currentValue: DecimalString;
  /**
   * Lifetime bought shares (the average-cost denominator) — never the
   * current balance, which is `currentSize`.
   */
  totalSize: DecimalString;
  realizedPnl: DecimalString;
  /** Mark-to-market PnL: `currentValue - entryCostUsdc`. */
  unrealizedPnl: DecimalString;
  /** Always `realizedPnl + unrealizedPnl`. */
  totalPnl: DecimalString;
  percentPnl: DecimalString;
  percentRealizedPnl: DecimalString;
  /**
   * The row's actual state — can be narrower than the requested status,
   * since an OPEN request also returns REDEEMABLE rows.
   */
  status: PositionStatus;
  redeemable: boolean;
  mergeable: boolean;
  negativeRisk: boolean;
  /** Whether the market is archived (surfaced by `includeArchived`). */
  archived: boolean;
  title?: string;
  slug?: string;
  icon?: string;
  eventId?: string;
  eventSlug?: string;
  outcome?: string;
  outcomeIndex?: number;
  oppositeOutcome?: string;
  /** Opposite outcome identifier for a CTF token or Polymarket V2 position. */
  oppositeAssetId?: TokenId | PositionId;
  /** @deprecated Use `oppositeAssetId`. */
  oppositeTokenId?: TokenId | PositionId;
  endDate?: IsoCalendarDateString;
  /**
   * The row's last economics event as Unix epoch milliseconds; absent on
   * positions with no native economics.
   */
  lastEventAt?: EpochMilliseconds;
  name?: string;
  profileImage?: string;
  verified: boolean;
};

/**
 * A positions row, normalized to the SDK vocabulary.
 *
 * The wire is strict snake_case: absence arrives as an empty string (or the
 * unknown-outcome sentinel `999`), normalized to `undefined` here. Timestamps
 * arrive as epoch seconds and normalize to epoch milliseconds, with `0`
 * (no native economics) normalized to `undefined`.
 */
export const PositionSchema = z
  .object({
    proxy_wallet: EvmAddressSchema,
    token_id: ClobAssetIdSchema,
    condition_id: ConditionIdSchema,
    current_size: DecimalishSchema,
    avg_price: DecimalishSchema,
    entry_cost_usdc: DecimalishSchema,
    entry_fees_usdc: DecimalishSchema,
    total_cost_usdc: DecimalishSchema,
    current_price: DecimalishSchema,
    current_value: DecimalishSchema,
    total_size: DecimalishSchema,
    realized_pnl: DecimalishSchema,
    unrealized_pnl: DecimalishSchema,
    total_pnl: DecimalishSchema,
    percent_pnl: DecimalishSchema,
    percent_realized_pnl: DecimalishSchema,
    status: PositionStatusSchema,
    redeemable: z.boolean(),
    mergeable: z.boolean(),
    negative_risk: z.boolean(),
    archived: z.boolean(),
    title: OptionalTextSchema,
    slug: OptionalTextSchema,
    icon: OptionalTextSchema,
    event_id: OptionalTextSchema,
    event_slug: OptionalTextSchema,
    outcome: OptionalTextSchema,
    outcome_index: UnknownOutcomeIndexToUndefinedSchema,
    opposite_outcome: OptionalTextSchema,
    opposite_token_id: z.preprocess(
      (value) => (value === '' ? undefined : value),
      ClobAssetIdSchema.optional(),
    ),
    end_date: z.preprocess(
      (value) => (value === '' ? undefined : value),
      IsoCalendarDateStringSchema.optional(),
    ),
    last_event_at: z.preprocess(
      (value) => (value === 0 ? undefined : value),
      EpochSecondsToMillisecondsSchema.optional(),
    ),
    name: OptionalTextSchema,
    profile_image: OptionalTextSchema,
    verified: z.boolean(),
  })
  .transform((position) => ({
    wallet: position.proxy_wallet,
    assetId: position.token_id,
    tokenId: position.token_id,
    conditionId: position.condition_id,
    currentSize: position.current_size,
    avgPrice: position.avg_price,
    entryCostUsdc: position.entry_cost_usdc,
    entryFeesUsdc: position.entry_fees_usdc,
    totalCostUsdc: position.total_cost_usdc,
    currentPrice: position.current_price,
    currentValue: position.current_value,
    totalSize: position.total_size,
    realizedPnl: position.realized_pnl,
    unrealizedPnl: position.unrealized_pnl,
    totalPnl: position.total_pnl,
    percentPnl: position.percent_pnl,
    percentRealizedPnl: position.percent_realized_pnl,
    status: position.status,
    redeemable: position.redeemable,
    mergeable: position.mergeable,
    negativeRisk: position.negative_risk,
    archived: position.archived,
    title: position.title,
    slug: position.slug,
    icon: position.icon,
    eventId: position.event_id,
    eventSlug: position.event_slug,
    outcome: position.outcome,
    outcomeIndex: position.outcome_index,
    oppositeOutcome: position.opposite_outcome,
    oppositeAssetId: position.opposite_token_id,
    oppositeTokenId: position.opposite_token_id,
    endDate: position.end_date,
    lastEventAt: position.last_event_at,
    name: position.name,
    profileImage: position.profile_image,
    verified: position.verified,
  })) satisfies z.ZodType<Position>;

export type PortfolioValue = {
  wallet: EvmAddress;
  /** Total marked portfolio value, in USDC, rounded to four decimals. */
  value: DecimalString;
};

export const PortfolioValueSchema = z
  .object({
    proxy_wallet: EvmAddressSchema,
    value: DecimalishSchema,
  })
  .transform(({ proxy_wallet, value }) => ({
    wallet: proxy_wallet,
    value,
  })) satisfies z.ZodType<PortfolioValue>;

/**
 * One cumulative wallet PnL observation. Fractional money and size values
 * are normalized to decimal strings.
 */
export type UserPnlPoint = {
  /** Observation time as Unix epoch milliseconds. */
  timestamp: EpochMilliseconds;
  /** Chain block at which the point was observed. */
  sourceBlock: number;
  /** Realized PnL from market positions. */
  realizedMarketPnl: DecimalString;
  /** Realized PnL from liquidity-provision activity. */
  realizedLpPnl: DecimalString;
  /** Realized PnL from combo positions. */
  realizedComboPnl: DecimalString;
  /** Mark-to-market PnL of open inventory. */
  unrealizedPnl: DecimalString | null;
  feesRefunded: DecimalString | null;
  makerRebate: DecimalString | null;
  takerRebate: DecimalString | null;
  rewardIncome: DecimalString | null;
  yieldIncome: DecimalString | null;
  referralIncome: DecimalString | null;
  deposits: DecimalString | null;
  withdrawals: DecimalString | null;
  /** Sum of market, liquidity-provision, and combo realized PnL. */
  realizedPnl: DecimalString;
  /** Rebates plus reward, yield, and referral income. */
  walletIncome: DecimalString | null;
  /** Realized plus unrealized position PnL. */
  positionPnl: DecimalString | null;
  /** Realized PnL plus wallet income. */
  settledPnl: DecimalString | null;
  /** Position PnL plus wallet income. */
  economicPnl: DecimalString | null;
  /** Compatibility trading-PnL series. */
  tradePnl: DecimalString | null;
  /** Reward, yield, and referral income. */
  sponsoredIncome: DecimalString | null;
  /** Cumulative fee charges, represented as a negative amount. */
  fees: DecimalString | null;
  /** Fee refunds minus charges. */
  feesPaid: DecimalString | null;
  /** Deposits minus withdrawals. */
  cashflowNet: DecimalString | null;
  /** Cumulative maker-attributed fill volume, in shares. */
  volume: DecimalString;
  /** Cumulative maker-attributed fill volume, in USDC. */
  volumeUsdc: DecimalString;
  /** Cumulative maker-attributed canonical fill count. */
  tradeCount: number;
};

const UncoveredAmountSchema = DecimalishSchema.nullish().transform(
  (amount) => amount ?? null,
);

export const UserPnlPointSchema = z
  .object({
    timestamp: EpochSecondsToMillisecondsSchema,
    source_block: z.number().int().nonnegative(),
    realized_market_pnl: DecimalishSchema,
    realized_lp_pnl: DecimalishSchema,
    realized_combo_pnl: DecimalishSchema,
    unrealized_pnl: UncoveredAmountSchema,
    fees_refunded: UncoveredAmountSchema,
    maker_rebate: UncoveredAmountSchema,
    taker_rebate: UncoveredAmountSchema,
    reward_income: UncoveredAmountSchema,
    yield_income: UncoveredAmountSchema,
    referral_income: UncoveredAmountSchema,
    deposits: UncoveredAmountSchema,
    withdrawals: UncoveredAmountSchema,
    realized_pnl: DecimalishSchema,
    wallet_income: UncoveredAmountSchema,
    position_pnl: UncoveredAmountSchema,
    settled_pnl: UncoveredAmountSchema,
    economic_pnl: UncoveredAmountSchema,
    trade_pnl: UncoveredAmountSchema,
    sponsored_income: UncoveredAmountSchema,
    fees: UncoveredAmountSchema,
    fees_paid: UncoveredAmountSchema,
    cashflow_net: UncoveredAmountSchema,
    volume: DecimalishSchema,
    volume_usdc: DecimalishSchema,
    trade_count: z.number().int().nonnegative(),
  })
  .transform(
    ({
      source_block,
      realized_market_pnl,
      realized_lp_pnl,
      realized_combo_pnl,
      unrealized_pnl,
      fees_refunded,
      maker_rebate,
      taker_rebate,
      reward_income,
      yield_income,
      referral_income,
      realized_pnl,
      wallet_income,
      position_pnl,
      settled_pnl,
      economic_pnl,
      trade_pnl,
      sponsored_income,
      fees_paid,
      cashflow_net,
      volume_usdc,
      trade_count,
      ...point
    }) => ({
      ...point,
      sourceBlock: source_block,
      realizedMarketPnl: realized_market_pnl,
      realizedLpPnl: realized_lp_pnl,
      realizedComboPnl: realized_combo_pnl,
      unrealizedPnl: unrealized_pnl,
      feesRefunded: fees_refunded,
      makerRebate: maker_rebate,
      takerRebate: taker_rebate,
      rewardIncome: reward_income,
      yieldIncome: yield_income,
      referralIncome: referral_income,
      realizedPnl: realized_pnl,
      walletIncome: wallet_income,
      positionPnl: position_pnl,
      settledPnl: settled_pnl,
      economicPnl: economic_pnl,
      tradePnl: trade_pnl,
      sponsoredIncome: sponsored_income,
      feesPaid: fees_paid,
      cashflowNet: cashflow_net,
      volumeUsdc: volume_usdc,
      tradeCount: trade_count,
    }),
  ) satisfies z.ZodType<UserPnlPoint>;

export type UserStats = {
  wallet: EvmAddress;
  /** Exact number of distinct markets the wallet has traded. */
  tradedMarketCount: number;
  /** Largest resolved position win over $1, in USDC; otherwise zero. */
  biggestWin: DecimalString;
  views: number;
  /** Account join time as Unix epoch milliseconds, when known. */
  joinDate: EpochMilliseconds | null;
  /** Latest cumulative all-time PnL observation, when published. */
  allTimePnl: UserPnlPoint | null;
};

export const UserStatsSchema = z
  .object({
    proxy_wallet: EvmAddressSchema,
    trades: z.number().int().nonnegative(),
    biggest_win: DecimalishSchema,
    views: z.number().int().nonnegative(),
    join_date: EpochSecondsToMillisecondsSchema.nullish(),
    all_time_pnl: UserPnlPointSchema.nullish(),
  })
  .transform(
    ({
      proxy_wallet,
      trades,
      biggest_win,
      join_date,
      all_time_pnl,
      ...stats
    }) => ({
      ...stats,
      wallet: proxy_wallet,
      tradedMarketCount: trades,
      biggestWin: biggest_win,
      joinDate: join_date ?? null,
      allTimePnl: all_time_pnl ?? null,
    }),
  ) satisfies z.ZodType<UserStats>;

export const ComboPositionMarketEventSchema = z
  .object({
    event_id: z.string().nullish(),
    event_slug: z.string().nullish(),
    event_title: z.string().nullish(),
    event_image: z.string().nullish(),
  })
  .transform(({ event_id, event_slug, event_title, event_image }) => ({
    eventId: event_id,
    eventSlug: event_slug,
    eventTitle: event_title,
    eventImage: event_image,
  }));

export const ComboPositionMarketSchema = z
  .object({
    market_id: z.string().nullish(),
    slug: z.string().nullish(),
    title: z.string().nullish(),
    outcome: z.string().nullish(),
    image_url: z.string().nullish(),
    icon_url: z.string().nullish(),
    category: z.string().nullish(),
    subcategory: z.string().nullish(),
    tags: z.array(z.string()).nullish(),
    end_date: IsoDateTimeStringSchema.nullish(),
    event: ComboPositionMarketEventSchema.nullish(),
  })
  .transform(({ market_id, image_url, icon_url, end_date, ...rest }) => ({
    ...rest,
    marketId: market_id,
    imageUrl: image_url,
    iconUrl: icon_url,
    endDate: end_date,
  }));

export const ComboPositionLegSchema = z
  .object({
    leg_index: z.number().int(),
    leg_position_id: PositionIdSchema,
    leg_condition_id: ConditionIdSchema,
    leg_outcome_index: z.number().int(),
    leg_outcome_label: z.string().nullish(),
    leg_status: ComboPositionStatusSchema,
    leg_resolved_at: IsoDateTimeStringSchema.nullish(),
    leg_current_price: DecimalishSchema.nullish(),
    market: ComboPositionMarketSchema.nullish(),
  })
  .transform(
    ({
      leg_index,
      leg_position_id,
      leg_condition_id,
      leg_outcome_index,
      leg_outcome_label,
      leg_status,
      leg_resolved_at,
      leg_current_price,
      ...rest
    }) => ({
      ...rest,
      legIndex: leg_index,
      legPositionId: leg_position_id,
      legConditionId: leg_condition_id,
      legOutcomeIndex: leg_outcome_index,
      legOutcomeLabel: leg_outcome_label,
      legStatus: leg_status,
      legResolvedAt: leg_resolved_at,
      legCurrentPrice: leg_current_price,
    }),
  );

export const ComboPositionSchema = z
  .object({
    combo_condition_id: ComboConditionIdSchema,
    outcome_index: z.number().int(),
    outcome_label: z.string(),
    combo_position_id: PositionIdSchema,
    proxy_wallet: EvmAddressSchema,
    current_size: DecimalishSchema,
    entry_avg_price_usdc: DecimalishSchema,
    entry_cost_usdc: DecimalishSchema,
    // Exact 6-dp basis pair — never reconstruct one from the others:
    // `entry_cost_usdc` is rounded weighted-average cost, while the
    // fee-exclusive basis is `gross_entry_cost_usdc − entry_fees_usdc`.
    gross_entry_cost_usdc: DecimalishSchema,
    entry_fees_usdc: DecimalishSchema,
    realized_payout_usdc: DecimalishSchema,
    status: ComboPositionStatusSchema,
    redeemable: z.boolean(),
    first_entry_at: IsoDateTimeStringSchema,
    resolved_at: IsoDateTimeStringSchema.nullish(),
    legs_total: z.number().int(),
    legs_resolved: z.number().int(),
    legs_pending: z.number().int(),
    legs: z.array(ComboPositionLegSchema),
    updated_at: IsoDateTimeStringSchema,
  })
  .transform(
    ({
      combo_condition_id,
      outcome_index,
      outcome_label,
      combo_position_id,
      proxy_wallet,
      current_size,
      entry_avg_price_usdc,
      entry_cost_usdc,
      gross_entry_cost_usdc,
      entry_fees_usdc,
      realized_payout_usdc,
      first_entry_at,
      resolved_at,
      legs_total,
      legs_resolved,
      legs_pending,
      updated_at,
      ...rest
    }) => ({
      ...rest,
      conditionId: combo_condition_id,
      outcomeIndex: outcome_index,
      outcomeLabel: outcome_label,
      positionId: combo_position_id,
      wallet: proxy_wallet,
      currentSize: current_size,
      entryAvgPriceUsdc: entry_avg_price_usdc,
      entryCostUsdc: entry_cost_usdc,
      grossEntryCostUsdc: gross_entry_cost_usdc,
      entryFeesUsdc: entry_fees_usdc,
      realizedPayoutUsdc: realized_payout_usdc,
      firstEntryAt: first_entry_at,
      resolvedAt: resolved_at,
      legsTotal: legs_total,
      legsResolved: legs_resolved,
      legsPending: legs_pending,
      updatedAt: updated_at,
    }),
  );

export const ListPositionsResponseSchema = dataPageSchema(PositionSchema);
export const FetchPortfolioValueResponseSchema =
  dataEnvelopeSchema(PortfolioValueSchema);
export const FetchUserStatsResponseSchema = dataEnvelopeSchema(
  UserStatsSchema.nullable(),
);
export const ListComboPositionsResponseSchema =
  dataPageSchema(ComboPositionSchema);

export type ComboPositionMarketEvent = z.infer<
  typeof ComboPositionMarketEventSchema
>;
export type ComboPositionMarket = z.infer<typeof ComboPositionMarketSchema>;
export type ComboPositionLeg = z.infer<typeof ComboPositionLegSchema>;
export type ComboPosition = z.infer<typeof ComboPositionSchema>;
export type ListPositionsResponse = z.infer<typeof ListPositionsResponseSchema>;
export type FetchPortfolioValueResponse = z.infer<
  typeof FetchPortfolioValueResponseSchema
>;
export type FetchUserStatsResponse = z.infer<
  typeof FetchUserStatsResponseSchema
>;
export type ListComboPositionsResponse = z.infer<
  typeof ListComboPositionsResponseSchema
>;
