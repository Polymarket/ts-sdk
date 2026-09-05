import { z } from 'zod';
import {
  type BuilderCode,
  BuilderCodeSchema,
  type ClobAssetId,
  ClobAssetIdSchema,
  type ComboConditionId,
  ComboConditionIdSchema,
  type ConditionId,
  ConditionIdSchema,
  DecimalishSchema,
  type DecimalString,
  type EpochMilliseconds,
  EpochSecondsToMillisecondsSchema,
  type EventId,
  EventIdSchema,
  type EvmAddress,
  EvmAddressSchema,
  emptyStringToNull,
  type IsoCalendarDateString,
  IsoCalendarDateStringSchema,
  type PositionId,
  PositionIdSchema,
} from '../shared';
import { dataEnvelopeSchema, dataPageSchema } from './envelope';

/** Window used to rank a leaderboard. */
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

/** Metric used to rank traders on the leaderboard. */
export enum TraderLeaderboardSort {
  Pnl = 'PNL',
  Volume = 'VOLUME',
}

export const TraderLeaderboardSortSchema = z.enum(TraderLeaderboardSort);

/** Source of a winning position. */
export enum BiggestWinnerKind {
  Market = 'market',
  Combo = 'combo',
}

export const BiggestWinnerKindSchema = z.enum(BiggestWinnerKind);

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
    rank: z.number().int().positive(),
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

const NullableTextSchema = z.preprocess(
  emptyStringToNull,
  z.string().nullable(),
);

export type TraderLeaderboardEntry = {
  /** Competition rank on the selected board; ties share a rank and the next rank skips. */
  rank: number;
  /** Ranked wallet. */
  wallet: EvmAddress;
  /** PnL in USD for the selected window. */
  pnl: DecimalString;
  /** Both-sides traded volume in shares. */
  volume: DecimalString;
  userName: string | null;
  profileImage: string | null;
  xUsername: string | null;
  verified: boolean;
};

export const TraderLeaderboardEntrySchema = z
  .object({
    rank: z.number().int().min(0),
    user_id: EvmAddressSchema,
    pnl: DecimalishSchema,
    volume: DecimalishSchema,
    user_name: NullableTextSchema,
    profile_image: NullableTextSchema,
    x_username: NullableTextSchema,
    verified: z.boolean(),
  })
  .transform(({ profile_image, user_id, user_name, x_username, ...entry }) => ({
    ...entry,
    wallet: user_id,
    userName: user_name,
    profileImage: profile_image,
    xUsername: x_username,
  })) satisfies z.ZodType<TraderLeaderboardEntry>;

export type TraderLeaderboardStanding = {
  /** Looked-up wallet. */
  wallet: EvmAddress;
  /** PnL in USD for the selected window. */
  pnl: DecimalString;
  /** Both-sides traded volume in shares. */
  volume: DecimalString;
  /** Competition rank on the PnL board, or `null` when unranked. */
  pnlRank: number | null;
  /** Competition rank on the volume board, or `null` when unranked. */
  volumeRank: number | null;
  userName: string | null;
  profileImage: string | null;
  xUsername: string | null;
  verified: boolean;
};

export const TraderLeaderboardStandingSchema = z
  .object({
    user_id: EvmAddressSchema,
    pnl: DecimalishSchema,
    volume: DecimalishSchema,
    rank_pnl: z.number().int().positive().nullable(),
    rank_volume: z.number().int().positive().nullable(),
    user_name: NullableTextSchema,
    profile_image: NullableTextSchema,
    x_username: NullableTextSchema,
    verified: z.boolean(),
  })
  .transform(
    ({
      profile_image,
      rank_pnl,
      rank_volume,
      user_id,
      user_name,
      x_username,
      ...standing
    }) => ({
      ...standing,
      wallet: user_id,
      pnlRank: rank_pnl,
      volumeRank: rank_volume,
      userName: user_name,
      profileImage: profile_image,
      xUsername: x_username,
    }),
  ) satisfies z.ZodType<TraderLeaderboardStanding>;

export type MarketBiggestWinner = {
  /** Unique one-based row ordinal on the selected board. */
  rank: number;
  kind: BiggestWinnerKind.Market;
  wallet: EvmAddress;
  /** Profit from this winning position, in USD. */
  pnl: DecimalString;
  /** Cost basis of this winning position, in USD. */
  initialValue: DecimalString;
  /** Value of this winning position at resolution, in USD. */
  finalValue: DecimalString;
  /** Resolution time as Unix epoch milliseconds. */
  resolvedAt: EpochMilliseconds;
  conditionId: ConditionId;
  assetId: ClobAssetId;
  eventId: EventId;
  eventSlug: string;
  eventTitle: string;
  userName: string | null;
  profileImage: string | null;
};

export type ComboBiggestWinner = {
  /** Unique one-based row ordinal on the selected board. */
  rank: number;
  kind: BiggestWinnerKind.Combo;
  wallet: EvmAddress;
  /** Profit from this winning position, in USD. */
  pnl: DecimalString;
  /** Cost basis of this winning position, in USD. */
  initialValue: DecimalString;
  /** Value of this winning position at resolution, in USD. */
  finalValue: DecimalString;
  /** Resolution time as Unix epoch milliseconds. */
  resolvedAt: EpochMilliseconds;
  conditionId: ComboConditionId;
  positionId: PositionId;
  eventId: null;
  eventSlug: null;
  /** Questions of the Combo's legs joined with ` / `. */
  eventTitle: string;
  userName: string | null;
  profileImage: string | null;
};

export type BiggestWinner = MarketBiggestWinner | ComboBiggestWinner;

const MarketBiggestWinnerSchema = z.object({
  win_rank: z.number().int().positive(),
  kind: z.literal(BiggestWinnerKind.Market),
  user_id: EvmAddressSchema,
  pnl: DecimalishSchema,
  initial_value: DecimalishSchema,
  final_value: DecimalishSchema,
  resolved_at: EpochSecondsToMillisecondsSchema,
  condition_id: ConditionIdSchema,
  position_id: ClobAssetIdSchema,
  event_id: EventIdSchema,
  event_slug: z.string(),
  event_title: z.string(),
  user_name: NullableTextSchema,
  profile_image: NullableTextSchema,
});

const ComboBiggestWinnerSchema = z.object({
  win_rank: z.number().int().positive(),
  kind: z.literal(BiggestWinnerKind.Combo),
  user_id: EvmAddressSchema,
  pnl: DecimalishSchema,
  initial_value: DecimalishSchema,
  final_value: DecimalishSchema,
  resolved_at: EpochSecondsToMillisecondsSchema,
  condition_id: ComboConditionIdSchema,
  position_id: PositionIdSchema,
  event_id: z.literal(0),
  event_slug: z.literal(''),
  event_title: z.string(),
  user_name: NullableTextSchema,
  profile_image: NullableTextSchema,
});

export const BiggestWinnerSchema = z
  .discriminatedUnion('kind', [
    MarketBiggestWinnerSchema,
    ComboBiggestWinnerSchema,
  ])
  .transform((winner): BiggestWinner => {
    if (winner.kind === BiggestWinnerKind.Combo) {
      return {
        rank: winner.win_rank,
        kind: winner.kind,
        wallet: winner.user_id,
        pnl: winner.pnl,
        initialValue: winner.initial_value,
        finalValue: winner.final_value,
        resolvedAt: winner.resolved_at,
        conditionId: winner.condition_id,
        positionId: winner.position_id,
        eventId: null,
        eventSlug: null,
        eventTitle: winner.event_title,
        userName: winner.user_name,
        profileImage: winner.profile_image,
      };
    }

    return {
      rank: winner.win_rank,
      kind: winner.kind,
      wallet: winner.user_id,
      pnl: winner.pnl,
      initialValue: winner.initial_value,
      finalValue: winner.final_value,
      resolvedAt: winner.resolved_at,
      conditionId: winner.condition_id,
      assetId: winner.position_id,
      eventId: winner.event_id,
      eventSlug: winner.event_slug,
      eventTitle: winner.event_title,
      userName: winner.user_name,
      profileImage: winner.profile_image,
    };
  }) satisfies z.ZodType<BiggestWinner>;

export const ListBuilderLeaderboardResponseSchema = dataPageSchema(
  BuilderStandingSchema,
);
export const FetchBuilderVolumeResponseSchema = dataEnvelopeSchema(
  z.array(BuilderVolumePointSchema),
);
export const ListTraderLeaderboardResponseSchema = dataPageSchema(
  TraderLeaderboardEntrySchema,
);
export const FetchTraderLeaderboardStandingResponseSchema = dataEnvelopeSchema(
  TraderLeaderboardStandingSchema.nullable(),
);
export const ListBiggestWinnersResponseSchema =
  dataPageSchema(BiggestWinnerSchema);

export type ListBuilderLeaderboardResponse = z.infer<
  typeof ListBuilderLeaderboardResponseSchema
>;
export type FetchBuilderVolumeResponse = z.infer<
  typeof FetchBuilderVolumeResponseSchema
>;
export type ListTraderLeaderboardResponse = z.infer<
  typeof ListTraderLeaderboardResponseSchema
>;
export type FetchTraderLeaderboardStandingResponse = z.infer<
  typeof FetchTraderLeaderboardStandingResponseSchema
>;
export type ListBiggestWinnersResponse = z.infer<
  typeof ListBiggestWinnersResponseSchema
>;
