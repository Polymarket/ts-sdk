import { z } from 'zod';
import {
  ClobAssetIdSchema,
  type ConditionId,
  ConditionIdSchema,
  DecimalishSchema,
  type DecimalString,
  EpochMillisecondsToIsoDateTimeStringSchema,
  EventIdSchema,
  MarketIdSchema,
  type PositionId,
  type TokenId,
} from '../shared';

const CurrentRewardConfigSchema = z
  .object({
    id: z.number().int().optional(),
    asset_address: z.string(),
    start_date: EpochMillisecondsToIsoDateTimeStringSchema,
    end_date: EpochMillisecondsToIsoDateTimeStringSchema.optional(),
    rate_per_day: DecimalishSchema,
    total_rewards: DecimalishSchema.optional(),
  })
  .transform(
    ({
      asset_address,
      start_date,
      end_date,
      rate_per_day,
      total_rewards,
      ...rest
    }) => ({
      ...rest,
      assetAddress: asset_address,
      startDate: start_date,
      endDate: end_date,
      ratePerDay: rate_per_day,
      totalRewards: total_rewards,
    }),
  );
export type CurrentRewardConfig = z.infer<typeof CurrentRewardConfigSchema>;

export const CurrentRewardSchema = z
  .object({
    condition_id: ConditionIdSchema,
    rewards_max_spread: z.number().optional(),
    rewards_min_size: DecimalishSchema.optional(),
    rewards_config: z.array(CurrentRewardConfigSchema).optional(),
    sponsored_daily_rate: DecimalishSchema.optional(),
    sponsors_count: z.number().int().optional(),
    native_daily_rate: DecimalishSchema.optional(),
    total_daily_rate: DecimalishSchema.optional(),
  })
  .transform(
    ({
      condition_id,
      rewards_max_spread,
      rewards_min_size,
      rewards_config,
      sponsored_daily_rate,
      sponsors_count,
      native_daily_rate,
      total_daily_rate,
      ...rest
    }) => ({
      ...rest,
      conditionId: condition_id,
      rewardsMaxSpread: rewards_max_spread,
      rewardsMinSize: rewards_min_size,
      rewardsConfig: rewards_config,
      sponsoredDailyRate: sponsored_daily_rate,
      sponsorsCount: sponsors_count,
      nativeDailyRate: native_daily_rate,
      totalDailyRate: total_daily_rate,
    }),
  );
export type CurrentReward = z.infer<typeof CurrentRewardSchema>;

export const PaginatedCurrentRewardsSchema = z
  .object({
    limit: z.number().int(),
    count: z.number().int(),
    next_cursor: z.string(),
    data: z.array(CurrentRewardSchema),
  })
  .transform(({ next_cursor, ...rest }) => ({
    ...rest,
    nextCursor: next_cursor,
  }));
export type PaginatedCurrentRewards = z.infer<
  typeof PaginatedCurrentRewardsSchema
>;

const RewardTokenSchema = z
  .object({
    token_id: ClobAssetIdSchema,
    outcome: z.string(),
    price: DecimalishSchema,
  })
  .transform(({ token_id, ...rest }) => ({
    ...rest,
    assetId: token_id,
    tokenId: token_id,
  })) satisfies z.ZodType<RewardToken>;
export type RewardToken = {
  assetId: TokenId | PositionId;
  /** @deprecated Use `assetId`. */
  tokenId: TokenId | PositionId;
  outcome: string;
  price: DecimalString;
};

const RewardConfigSchema = z
  .object({
    asset_address: z.string(),
    start_date: EpochMillisecondsToIsoDateTimeStringSchema,
    end_date: EpochMillisecondsToIsoDateTimeStringSchema.optional(),
    rate_per_day: DecimalishSchema,
    total_rewards: DecimalishSchema.optional(),
  })
  .transform(
    ({
      asset_address,
      start_date,
      end_date,
      rate_per_day,
      total_rewards,
      ...rest
    }) => ({
      ...rest,
      assetAddress: asset_address,
      startDate: start_date,
      endDate: end_date,
      ratePerDay: rate_per_day,
      totalRewards: total_rewards,
    }),
  );
export type RewardConfig = z.infer<typeof RewardConfigSchema>;

export const MarketRewardSchema = z
  .object({
    condition_id: ConditionIdSchema,
    question: z.string(),
    market_slug: z.string().optional(),
    event_slug: z.string().optional(),
    image: z.string().optional(),
    rewards_max_spread: z.number().optional(),
    rewards_min_size: DecimalishSchema.optional(),
    market_competitiveness: z.number().optional(),
    tokens: z.array(RewardTokenSchema),
    rewards_config: z.array(RewardConfigSchema).optional(),
  })
  .transform(
    ({
      condition_id,
      market_slug,
      event_slug,
      rewards_max_spread,
      rewards_min_size,
      market_competitiveness,
      rewards_config,
      ...rest
    }) => ({
      ...rest,
      conditionId: condition_id,
      marketSlug: market_slug,
      eventSlug: event_slug,
      rewardsMaxSpread: rewards_max_spread,
      rewardsMinSize: rewards_min_size,
      marketCompetitiveness: market_competitiveness,
      rewardsConfig: rewards_config,
    }),
  ) satisfies z.ZodType<MarketReward>;
export type MarketReward = {
  conditionId: ConditionId;
  question: string;
  marketSlug: string | undefined;
  eventSlug: string | undefined;
  image?: string;
  rewardsMaxSpread: number | undefined;
  rewardsMinSize: DecimalString | undefined;
  marketCompetitiveness: number | undefined;
  tokens: RewardToken[];
  rewardsConfig: RewardConfig[] | undefined;
};

export const PaginatedMarketRewardsSchema = z
  .object({
    limit: z.number().int(),
    count: z.number().int(),
    next_cursor: z.string(),
    data: z.array(MarketRewardSchema),
  })
  .transform(({ next_cursor, ...rest }) => ({
    ...rest,
    nextCursor: next_cursor,
  }));
export type PaginatedMarketRewards = z.infer<
  typeof PaginatedMarketRewardsSchema
>;

/** Fields available for ordering reward market discovery. */
export enum RewardMarketSort {
  MarketId = 'market_id',
  CreatedAt = 'created_at',
  Volume24Hr = 'volume_24hr',
  Spread = 'spread',
  Competitiveness = 'competitiveness',
  MaxSpread = 'max_spread',
  MinSize = 'min_size',
  Question = 'question',
  OneDayPriceChange = 'one_day_price_change',
  RatePerDay = 'rate_per_day',
  Price = 'price',
  EndDate = 'end_date',
  StartDate = 'start_date',
  RewardEndDate = 'reward_end_date',
}

/** Active market with its reward configurations and discovery metadata. */
export const RewardMarketSchema = z
  .object({
    condition_id: ConditionIdSchema,
    market_id: MarketIdSchema,
    market_slug: z.string(),
    question: z.string(),
    image: z.string(),
    market_competitiveness: z.number(),
    rewards_config: z.array(CurrentRewardConfigSchema),
    rewards_max_spread: z.number(),
    rewards_min_size: DecimalishSchema,
    spread: DecimalishSchema,
    tokens: z.array(RewardTokenSchema),
    group_item_title: z.string(),
    volume_24hr: DecimalishSchema,
    event_id: EventIdSchema,
    event_slug: z.string(),
    created_at: EpochMillisecondsToIsoDateTimeStringSchema,
    one_day_price_change: DecimalishSchema,
    end_date: z
      .literal('')
      .transform(() => undefined)
      .or(EpochMillisecondsToIsoDateTimeStringSchema),
  })
  .transform(
    ({
      condition_id,
      market_id,
      market_slug,
      market_competitiveness,
      rewards_config,
      rewards_max_spread,
      rewards_min_size,
      group_item_title,
      volume_24hr,
      event_id,
      event_slug,
      created_at,
      one_day_price_change,
      end_date,
      ...rest
    }) => ({
      ...rest,
      conditionId: condition_id,
      marketId: market_id,
      marketSlug: market_slug,
      marketCompetitiveness: market_competitiveness,
      rewardsConfig: rewards_config,
      rewardsMaxSpread: rewards_max_spread,
      rewardsMinSize: rewards_min_size,
      groupItemTitle: group_item_title,
      volume24hr: volume_24hr,
      eventId: event_id,
      eventSlug: event_slug,
      createdAt: created_at,
      oneDayPriceChange: one_day_price_change,
      endDate: end_date,
    }),
  );
export type RewardMarket = z.infer<typeof RewardMarketSchema>;
export const PaginatedRewardMarketsSchema = z
  .object({
    limit: z.number().int(),
    count: z.number().int(),
    next_cursor: z.string(),
    data: z.array(RewardMarketSchema),
  })
  .transform(({ next_cursor, ...rest }) => ({
    ...rest,
    nextCursor: next_cursor,
  }));
