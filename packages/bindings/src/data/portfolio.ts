import type { EvmAddress } from '@polymarket/types';
import { z } from 'zod';
import {
  ClobAssetIdSchema,
  ComboConditionIdSchema,
  type ConditionId,
  ConditionIdSchema,
  DecimalishSchema,
  type EpochMilliseconds,
  EpochSecondsToMillisecondsSchema,
  EvmAddressSchema,
  IsoDateTimeStringSchema,
  type PositionId,
  PositionIdSchema,
  type TokenId,
} from '../shared';
import { dataPageSchema } from './envelope';

export enum ComboPositionStatus {
  Open = 'OPEN',
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
  currentSize: number;
  avgPrice: number;
  /** The fee-exclusive entry basis in USD. */
  entryCostUsdc: number;
  /**
   * Attributed BUY-fee total in USD. Disclosure only — `entryCostUsdc` is
   * already fee-exclusive, so never re-deduct this from a PnL figure.
   */
  entryFeesUsdc: number;
  /** Gross (fee-inclusive) basis: always `entryCostUsdc + entryFeesUsdc`. */
  totalCostUsdc: number;
  currentPrice: number;
  currentValue: number;
  /**
   * Lifetime bought shares (the average-cost denominator) — never the
   * current balance, which is `currentSize`.
   */
  totalSize: number;
  realizedPnl: number;
  /** Mark-to-market PnL: `currentValue - entryCostUsdc`. */
  unrealizedPnl: number;
  /** Always `realizedPnl + unrealizedPnl`. */
  totalPnl: number;
  percentPnl: number;
  percentRealizedPnl: number;
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
  endDate?: string;
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
    current_size: z.number(),
    avg_price: z.number(),
    entry_cost_usdc: z.number(),
    entry_fees_usdc: z.number(),
    total_cost_usdc: z.number(),
    current_price: z.number(),
    current_value: z.number(),
    total_size: z.number(),
    realized_pnl: z.number(),
    unrealized_pnl: z.number(),
    total_pnl: z.number(),
    percent_pnl: z.number(),
    percent_realized_pnl: z.number(),
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
    end_date: OptionalTextSchema,
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

export const ValueSchema = z.object({
  user: EvmAddressSchema.nullish(),
  value: DecimalishSchema.nullish(),
});

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
    current_size: z.number(),
    entry_avg_price_usdc: z.number(),
    entry_cost_usdc: z.number(),
    // Exact 6-dp decimal strings — never reconstruct one from the others:
    // `entry_cost_usdc` is rounded weighted-average cost, while the
    // fee-exclusive basis is `gross_entry_cost_usdc − entry_fees_usdc`.
    gross_entry_cost_usdc: DecimalishSchema,
    entry_fees_usdc: DecimalishSchema,
    realized_payout_usdc: z.number(),
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
export const FetchPortfolioValueResponseSchema = z.array(ValueSchema);
export const ListComboPositionsResponseSchema =
  dataPageSchema(ComboPositionSchema);

export type Value = z.infer<typeof ValueSchema>;
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
export type ListComboPositionsResponse = z.infer<
  typeof ListComboPositionsResponseSchema
>;
