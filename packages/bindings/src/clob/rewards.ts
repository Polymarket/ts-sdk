import { z } from 'zod';
import {
  ConditionIdSchema,
  DecimalishSchema,
  EpochMillisecondsToIsoDateTimeStringSchema,
  TokenIdSchema,
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
    token_id: TokenIdSchema,
    outcome: z.string(),
    price: DecimalishSchema,
  })
  .transform(({ token_id, ...rest }) => ({
    ...rest,
    tokenId: token_id,
  }));
export type RewardToken = z.infer<typeof RewardTokenSchema>;

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
  );
export type MarketReward = z.infer<typeof MarketRewardSchema>;

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
