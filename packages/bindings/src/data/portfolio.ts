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
  emptyStringToNull,
  type IsoCalendarDateString,
  IsoCalendarDateStringSchema,
  IsoDateTimeStringSchema,
  type MixedDateTimeString,
  MixedDateTimeStringSchema,
  PaginationCursorSchema,
  type PositionId,
  PositionIdSchema,
  type TokenId,
} from '../shared';

export enum ComboPositionStatus {
  Open = 'OPEN',
  Partial = 'PARTIAL',
  ResolvedPartial = 'RESOLVED_PARTIAL',
  ResolvedWin = 'RESOLVED_WIN',
  ResolvedLoss = 'RESOLVED_LOSS',
}

export const ComboPositionStatusSchema = z.enum(ComboPositionStatus);

export enum ComboPositionOutcome {
  Yes = 'YES',
  No = 'NO',
}

export const ComboPositionOutcomeSchema = z.enum(ComboPositionOutcome);

export type Position = {
  wallet: EvmAddress | null | undefined;
  /** Outcome identifier for a CTF token or Polymarket V2 position. */
  assetId: TokenId | PositionId | null | undefined;
  /** @deprecated Use `assetId`. */
  tokenId: TokenId | PositionId | null | undefined;
  conditionId: ConditionId;
  size?: DecimalString | null;
  avgPrice?: DecimalString | null;
  initialValue?: DecimalString | null;
  currentValue?: DecimalString | null;
  cashPnl?: DecimalString | null;
  percentPnl?: number | null;
  totalBought?: DecimalString | null;
  realizedPnl?: DecimalString | null;
  percentRealizedPnl?: number | null;
  curPrice?: DecimalString | null;
  redeemable?: boolean | null;
  mergeable?: boolean | null;
  title?: string | null;
  slug?: string | null;
  icon?: string | null;
  eventId?: string | null;
  eventSlug?: string | null;
  outcome?: string | null;
  outcomeIndex?: number | null;
  oppositeOutcome?: string | null;
  /** Opposite outcome identifier for a CTF token or Polymarket V2 position. */
  oppositeAssetId: TokenId | PositionId | null | undefined;
  /** @deprecated Use `oppositeAssetId`. */
  oppositeTokenId: TokenId | PositionId | null | undefined;
  endDate?: IsoCalendarDateString | null;
  negativeRisk?: boolean | null;
};

export const PositionSchema = z
  .object({
    proxyWallet: EvmAddressSchema.nullish(),
    asset: ClobAssetIdSchema.nullish(),
    conditionId: ConditionIdSchema,
    size: DecimalishSchema.nullish(),
    avgPrice: DecimalishSchema.nullish(),
    initialValue: DecimalishSchema.nullish(),
    currentValue: DecimalishSchema.nullish(),
    cashPnl: DecimalishSchema.nullish(),
    percentPnl: z.number().nullish(),
    totalBought: DecimalishSchema.nullish(),
    realizedPnl: DecimalishSchema.nullish(),
    percentRealizedPnl: z.number().nullish(),
    curPrice: DecimalishSchema.nullish(),
    redeemable: z.boolean().nullish(),
    mergeable: z.boolean().nullish(),
    title: z.string().nullish(),
    slug: z.string().nullish(),
    icon: z.preprocess(emptyStringToNull, z.string().nullish()),
    eventId: z.string().nullish(),
    eventSlug: z.string().nullish(),
    outcome: z.string().nullish(),
    outcomeIndex: z.number().int().nullish(),
    oppositeOutcome: z.string().nullish(),
    oppositeAsset: ClobAssetIdSchema.nullish(),
    endDate: IsoCalendarDateStringSchema.nullish(),
    negativeRisk: z.boolean().nullish(),
  })
  .transform(({ asset, oppositeAsset, proxyWallet, ...rest }) => ({
    ...rest,
    wallet: proxyWallet,
    assetId: asset,
    tokenId: asset,
    oppositeAssetId: oppositeAsset,
    oppositeTokenId: oppositeAsset,
  })) satisfies z.ZodType<Position>;

export type ClosedPosition = {
  wallet: EvmAddress | null | undefined;
  /** Outcome identifier for a CTF token or Polymarket V2 position. */
  assetId: TokenId | PositionId | null | undefined;
  /** @deprecated Use `assetId`. */
  tokenId: TokenId | PositionId | null | undefined;
  conditionId?: ConditionId | null;
  avgPrice?: DecimalString | null;
  totalBought?: DecimalString | null;
  realizedPnl?: DecimalString | null;
  curPrice?: DecimalString | null;
  timestamp?: EpochMilliseconds | null;
  title?: string | null;
  slug?: string | null;
  icon?: string | null;
  eventSlug?: string | null;
  outcome?: string | null;
  outcomeIndex?: number | null;
  oppositeOutcome?: string | null;
  /** Opposite outcome identifier for a CTF token or Polymarket V2 position. */
  oppositeAssetId: TokenId | PositionId | null | undefined;
  /** @deprecated Use `oppositeAssetId`. */
  oppositeTokenId: TokenId | PositionId | null | undefined;
  endDate?: MixedDateTimeString | null;
};

export const ClosedPositionSchema = z
  .object({
    proxyWallet: EvmAddressSchema.nullish(),
    asset: ClobAssetIdSchema.nullish(),
    conditionId: ConditionIdSchema.nullish(),
    avgPrice: DecimalishSchema.nullish(),
    totalBought: DecimalishSchema.nullish(),
    realizedPnl: DecimalishSchema.nullish(),
    curPrice: DecimalishSchema.nullish(),
    timestamp: EpochSecondsToMillisecondsSchema.nullish(),
    title: z.string().nullish(),
    slug: z.string().nullish(),
    icon: z.preprocess(emptyStringToNull, z.string().nullish()),
    eventSlug: z.string().nullish(),
    outcome: z.string().nullish(),
    outcomeIndex: z.number().int().nullish(),
    oppositeOutcome: z.string().nullish(),
    oppositeAsset: ClobAssetIdSchema.nullish(),
    endDate: MixedDateTimeStringSchema.nullish(),
  })
  .transform(({ asset, oppositeAsset, proxyWallet, ...rest }) => ({
    ...rest,
    wallet: proxyWallet,
    assetId: asset,
    tokenId: asset,
    oppositeAssetId: oppositeAsset,
    oppositeTokenId: oppositeAsset,
  })) satisfies z.ZodType<ClosedPosition>;

export const ValueSchema = z.object({
  user: EvmAddressSchema.nullish(),
  value: DecimalishSchema.nullish(),
});

export type MarketPosition = {
  wallet: EvmAddress | null | undefined;
  /** Outcome identifier for a CTF token or Polymarket V2 position. */
  assetId: TokenId | PositionId | null | undefined;
  /** @deprecated Use `assetId`. */
  tokenId: TokenId | PositionId | null | undefined;
  name?: string | null;
  profileImage?: string | null;
  verified?: boolean | null;
  conditionId?: ConditionId | null;
  avgPrice?: DecimalString | null;
  size?: DecimalString | null;
  currPrice?: DecimalString | null;
  currentValue?: DecimalString | null;
  cashPnl?: DecimalString | null;
  totalBought?: DecimalString | null;
  realizedPnl?: DecimalString | null;
  totalPnl?: DecimalString | null;
  outcome?: string | null;
  outcomeIndex?: number | null;
};

export const MarketPositionSchema = z
  .object({
    proxyWallet: EvmAddressSchema.nullish(),
    name: z.string().nullish(),
    profileImage: z.string().nullish(),
    verified: z.boolean().nullish(),
    asset: ClobAssetIdSchema.nullish(),
    conditionId: ConditionIdSchema.nullish(),
    avgPrice: DecimalishSchema.nullish(),
    size: DecimalishSchema.nullish(),
    currPrice: DecimalishSchema.nullish(),
    currentValue: DecimalishSchema.nullish(),
    cashPnl: DecimalishSchema.nullish(),
    totalBought: DecimalishSchema.nullish(),
    realizedPnl: DecimalishSchema.nullish(),
    totalPnl: DecimalishSchema.nullish(),
    outcome: z.string().nullish(),
    outcomeIndex: z.number().int().nullish(),
  })
  .transform(({ asset, proxyWallet, ...rest }) => ({
    ...rest,
    wallet: proxyWallet,
    assetId: asset,
    tokenId: asset,
  })) satisfies z.ZodType<MarketPosition>;

export type MetaMarketPosition = {
  /** Outcome identifier for a CTF token or Polymarket V2 position. */
  assetId: TokenId | PositionId | null | undefined;
  /** @deprecated Use `assetId`. */
  token: TokenId | PositionId | null | undefined;
  positions?: MarketPosition[] | null;
};

export const MetaMarketPositionSchema = z
  .object({
    token: ClobAssetIdSchema.nullish(),
    positions: z.array(MarketPositionSchema).nullish(),
  })
  .transform(({ token, ...rest }) => ({
    ...rest,
    assetId: token,
    token,
  })) satisfies z.ZodType<MetaMarketPosition>;

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
    combo_position_id: PositionIdSchema,
    side: ComboPositionOutcomeSchema,
    module_id: z.number().int(),
    user_address: EvmAddressSchema,
    shares_balance: DecimalishSchema,
    entry_avg_price_usdc: DecimalishSchema.nullish(),
    entry_cost_usdc: DecimalishSchema.nullish(),
    realized_payout_usdc: DecimalishSchema.nullish(),
    total_cost_usdc: DecimalishSchema.nullish(),
    status: ComboPositionStatusSchema,
    redeemable: z.boolean(),
    first_entry_at: IsoDateTimeStringSchema,
    resolved_at: IsoDateTimeStringSchema.nullish(),
    updated_at: IsoDateTimeStringSchema.optional(),
    legs_total: z.number().int(),
    legs_resolved: z.number().int(),
    legs_pending: z.number().int(),
    legs: z.array(ComboPositionLegSchema),
  })
  .transform(
    ({
      combo_condition_id,
      combo_position_id,
      side,
      module_id,
      user_address,
      shares_balance,
      entry_avg_price_usdc,
      entry_cost_usdc,
      realized_payout_usdc,
      total_cost_usdc,
      first_entry_at,
      resolved_at,
      updated_at,
      legs_total,
      legs_resolved,
      legs_pending,
      ...rest
    }) => ({
      ...rest,
      conditionId: combo_condition_id,
      positionId: combo_position_id,
      outcome: side,
      moduleId: module_id,
      wallet: user_address,
      shares: shares_balance,
      entryAvgPriceUsdc: entry_avg_price_usdc,
      entryCostUsdc: entry_cost_usdc,
      realizedPayoutUsdc: realized_payout_usdc,
      totalCostUsdc: total_cost_usdc,
      firstEntryAt: first_entry_at,
      resolvedAt: resolved_at,
      updatedAt: updated_at,
      legsTotal: legs_total,
      legsResolved: legs_resolved,
      legsPending: legs_pending,
    }),
  );

export const ListComboPositionsResponseSchema = z
  .object({
    combos: z.array(ComboPositionSchema),
    pagination: z.object({
      limit: z.number().int(),
      offset: z.number().int(),
      has_more: z.boolean(),
      next_cursor: PaginationCursorSchema.nullish(),
    }),
  })
  .transform(({ pagination, ...rest }) => ({
    ...rest,
    pagination: {
      limit: pagination.limit,
      offset: pagination.offset,
      hasMore: pagination.has_more,
      nextCursor: pagination.next_cursor,
    },
  }));

export const ListPositionsResponseSchema = z.array(PositionSchema);
export const ListClosedPositionsResponseSchema = z.array(ClosedPositionSchema);
export const FetchPortfolioValueResponseSchema = z.array(ValueSchema);
export const ListMarketPositionsResponseSchema = z.array(
  MetaMarketPositionSchema,
);

export type Value = z.infer<typeof ValueSchema>;
export type ComboPositionMarketEvent = z.infer<
  typeof ComboPositionMarketEventSchema
>;
export type ComboPositionMarket = z.infer<typeof ComboPositionMarketSchema>;
export type ComboPositionLeg = z.infer<typeof ComboPositionLegSchema>;
export type ComboPosition = z.infer<typeof ComboPositionSchema>;
export type ListPositionsResponse = z.infer<typeof ListPositionsResponseSchema>;
export type ListClosedPositionsResponse = z.infer<
  typeof ListClosedPositionsResponseSchema
>;
export type FetchPortfolioValueResponse = z.infer<
  typeof FetchPortfolioValueResponseSchema
>;
export type ListMarketPositionsResponse = z.infer<
  typeof ListMarketPositionsResponseSchema
>;
export type ListComboPositionsResponse = z.infer<
  typeof ListComboPositionsResponseSchema
>;
