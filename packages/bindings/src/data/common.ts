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
  /**
   * A user-to-user tip. Opt-in: never part of the default set — rows are
   * served only when the `type` filter names TIP explicitly.
   */
  TIP = 'TIP',
}

export const ActivityTypeSchema = z.enum(ActivityType);

export const SideSchema = z.enum(['BUY', 'SELL']);

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

export type Side = z.infer<typeof SideSchema>;
export type TimePeriod = z.infer<typeof TimePeriodSchema>;
export type LeaderboardCategory = z.infer<typeof LeaderboardCategorySchema>;
export type LeaderboardOrderBy = z.infer<typeof LeaderboardOrderBySchema>;
