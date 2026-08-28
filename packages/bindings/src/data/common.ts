import { z } from 'zod';

export enum ActivityType {
  TRADE = 'TRADE',
  SPLIT = 'SPLIT',
  MERGE = 'MERGE',
  REDEEM = 'REDEEM',
  REWARD = 'REWARD',
  CONVERSION = 'CONVERSION',
  MIGRATION = 'MIGRATION',
  MAKER_REBATE = 'MAKER_REBATE',
  REFERRAL_REWARD = 'REFERRAL_REWARD',
  YIELD = 'YIELD',
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TAKER_REBATE = 'TAKER_REBATE',
  /** A user-to-user tip, served in the feed like every other type. */
  TIP = 'TIP',
}

export const ActivityTypeSchema = z.enum(ActivityType);

/** Direction of a TIP from the row wallet's perspective. */
export enum TipSide {
  In = 'IN',
  Out = 'OUT',
}

export const TipSideSchema = z.enum(TipSide);

/** Sort order of a listed feed. */
export enum SortDirection {
  Asc = 'ASC',
  Desc = 'DESC',
}

export const SortDirectionSchema = z.enum(SortDirection);

/** Unit the trades dust filter applies to. */
export enum TradeFilterType {
  Cash = 'CASH',
  Tokens = 'TOKENS',
}

export const TradeFilterTypeSchema = z.enum(TradeFilterType);

export const TimePeriodSchema = z.enum(['DAY', 'WEEK', 'MONTH', 'ALL']);

export const LeaderboardCategorySchema = z.enum([
  'OVERALL',
  'POLITICS',
  'SPORTS',
  'CRYPTO',
  'CULTURE',
  'MENTIONS',
  'WEATHER',
  'ECONOMICS',
  'TECH',
  'FINANCE',
]);

export const LeaderboardOrderBySchema = z.enum(['PNL', 'VOL']);

export type TimePeriod = z.infer<typeof TimePeriodSchema>;
export type LeaderboardCategory = z.infer<typeof LeaderboardCategorySchema>;
export type LeaderboardOrderBy = z.infer<typeof LeaderboardOrderBySchema>;
