import { z } from 'zod';
import {
  DecimalishSchema,
  EvmAddressSchema,
  IsoDateTimeStringSchema,
} from '../shared';

export const LeaderboardEntrySchema = z.object({
  rank: z.string().nullish(),
  builder: z.string().nullish(),
  volume: DecimalishSchema.nullish(),
  activeUsers: z.number().int().nullish(),
  verified: z.boolean().nullish(),
  builderLogo: z.string().nullish(),
});

export const BuilderVolumeEntrySchema = z
  .object({
    dt: IsoDateTimeStringSchema.nullish(),
    builder: z.string().nullish(),
    builderLogo: z.string().nullish(),
    verified: z.boolean().nullish(),
    volume: DecimalishSchema.nullish(),
    activeUsers: z.number().int().nullish(),
    rank: z.string().nullish(),
  })
  .transform(({ dt, ...rest }) => ({
    ...rest,
    bucketAt: dt,
  }));

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

export const ListBuilderLeaderboardResponseSchema = z.array(
  LeaderboardEntrySchema,
);
export const ListBuilderVolumeResponseSchema = z.array(
  BuilderVolumeEntrySchema,
);
export const ListTraderLeaderboardResponseSchema = z.array(
  TraderLeaderboardEntrySchema,
);

export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export type BuilderVolumeEntry = z.infer<typeof BuilderVolumeEntrySchema>;
export type TraderLeaderboardEntry = z.infer<
  typeof TraderLeaderboardEntrySchema
>;
export type ListBuilderLeaderboardResponse = z.infer<
  typeof ListBuilderLeaderboardResponseSchema
>;
export type ListBuilderVolumeResponse = z.infer<
  typeof ListBuilderVolumeResponseSchema
>;
export type ListTraderLeaderboardResponse = z.infer<
  typeof ListTraderLeaderboardResponseSchema
>;
