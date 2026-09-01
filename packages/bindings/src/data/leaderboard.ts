import { z } from 'zod';
import {
  type BuilderCode,
  BuilderCodeSchema,
  DecimalishSchema,
  type DecimalString,
  EvmAddressSchema,
  type IsoCalendarDateString,
  IsoCalendarDateStringSchema,
} from '../shared';
import { dataEnvelopeSchema, dataPageSchema } from './envelope';

/** Window used to rank builders on the builder leaderboard. */
export enum LeaderboardWindow {
  Day = 'day',
  Week = 'week',
  Month = 'month',
  All = 'all',
}

export const LeaderboardWindowSchema = z.enum(LeaderboardWindow);

/** Bucket width used by the builder volume time series. */
export enum BuilderVolumeInterval {
  Day = 'day',
  Week = 'week',
  Month = 'month',
  /** Groups the series by calendar year. */
  Year = 'all',
}

export const BuilderVolumeIntervalSchema = z.enum(BuilderVolumeInterval);

export type BuilderStanding = {
  /** Rank in the selected leaderboard window. */
  rank: number;
  /** Display name; use `builderCode` as the stable identifier. */
  builderName: string;
  /** Stable builder identifier. */
  builderCode: BuilderCode;
  profileImage?: string;
  verified: boolean;
  /** Builder-attributed volume in shares. */
  volume: DecimalString;
  /** Distinct active users attributed to the builder. */
  activeUsers: number;
};

export const BuilderStandingSchema = z
  .object({
    rank: z.number().int().min(0),
    builder_name: z.string(),
    builder_code: BuilderCodeSchema,
    profile_image: z.string(),
    verified: z.boolean(),
    volume: DecimalishSchema,
    active_users: z.number().int().min(0),
  })
  .transform(
    ({ active_users, builder_code, builder_name, profile_image, ...rest }) => ({
      ...rest,
      activeUsers: active_users,
      builderCode: builder_code,
      builderName: builder_name,
      ...(profile_image === '' ? {} : { profileImage: profile_image }),
    }),
  ) satisfies z.ZodType<BuilderStanding>;

export type BuilderVolumePoint = {
  /** UTC start date of the volume bucket. */
  bucketDate: IsoCalendarDateString;
  /** Builder rank within this bucket. */
  rank: number;
  /** Display name; use `builderCode` as the stable identifier. */
  builderName: string;
  /** Stable builder identifier. */
  builderCode: BuilderCode;
  profileImage?: string;
  verified: boolean;
  /** Builder-attributed volume in shares for this bucket. */
  volume: DecimalString;
  /** Distinct active users attributed within this bucket. */
  activeUsers: number;
};

export const BuilderVolumePointSchema = z
  .object({
    date: IsoCalendarDateStringSchema,
    rank: z.number().int().min(0),
    builder_name: z.string(),
    builder_code: BuilderCodeSchema,
    profile_image: z.string(),
    verified: z.boolean(),
    volume: DecimalishSchema,
    active_users: z.number().int().min(0),
  })
  .transform(
    ({
      active_users,
      builder_code,
      builder_name,
      date,
      profile_image,
      ...rest
    }) => ({
      ...rest,
      activeUsers: active_users,
      bucketDate: date,
      builderCode: builder_code,
      builderName: builder_name,
      ...(profile_image === '' ? {} : { profileImage: profile_image }),
    }),
  ) satisfies z.ZodType<BuilderVolumePoint>;

export const TraderLeaderboardEntrySchema = z
  .object({
    rank: z.string().nullish(),
    proxyWallet: EvmAddressSchema.nullish(),
    userName: z.string().nullish(),
    vol: DecimalishSchema.nullish(),
    pnl: DecimalishSchema.nullish(),
    profileImage: z.string().nullish(),
    xUsername: z.string().nullish(),
    verifiedBadge: z.boolean().nullish(),
  })
  .transform(({ proxyWallet, ...rest }) => ({
    ...rest,
    wallet: proxyWallet,
  }));

export const ListBuilderLeaderboardResponseSchema = dataPageSchema(
  BuilderStandingSchema,
);
export const FetchBuilderVolumeResponseSchema = dataEnvelopeSchema(
  z.array(BuilderVolumePointSchema),
);
export const ListTraderLeaderboardResponseSchema = z.array(
  TraderLeaderboardEntrySchema,
);

export type TraderLeaderboardEntry = z.infer<
  typeof TraderLeaderboardEntrySchema
>;
export type ListBuilderLeaderboardResponse = z.infer<
  typeof ListBuilderLeaderboardResponseSchema
>;
export type FetchBuilderVolumeResponse = z.infer<
  typeof FetchBuilderVolumeResponseSchema
>;
export type ListTraderLeaderboardResponse = z.infer<
  typeof ListTraderLeaderboardResponseSchema
>;
