import type { EvmAddress } from '@polymarket/types';
import { z } from 'zod';
import {
  ClobAssetIdSchema,
  type ConditionId,
  ConditionIdSchema,
  DecimalishSchema,
  type DecimalString,
  EvmAddressSchema,
  emptyStringToNull,
  type PositionId,
  type TokenId,
} from '../shared';
import { dataEnvelopeSchema } from './envelope';

export type Holder = {
  wallet: EvmAddress | null | undefined;
  /** Outcome identifier for a CTF token or Polymarket V2 position. */
  assetId: TokenId | PositionId | null | undefined;
  /** @deprecated Use `assetId`. */
  tokenId: TokenId | PositionId | null | undefined;
  bio?: string | null;
  pseudonym?: string | null;
  amount?: DecimalString | null;
  displayUsernamePublic?: boolean | null;
  outcomeIndex?: number | null;
  name?: string | null;
  profileImage?: string | null;
  profileImageOptimized?: string | null;
};

export const HolderSchema = z
  .object({
    proxyWallet: EvmAddressSchema.nullish(),
    bio: z.string().nullish(),
    asset: ClobAssetIdSchema.nullish(),
    pseudonym: z.string().nullish(),
    amount: DecimalishSchema.nullish(),
    displayUsernamePublic: z.boolean().nullish(),
    outcomeIndex: z.number().int().nullish(),
    name: z.string().nullish(),
    profileImage: z.string().nullish(),
    profileImageOptimized: z.string().nullish(),
  })
  .transform(({ asset, proxyWallet, ...rest }) => ({
    ...rest,
    wallet: proxyWallet,
    assetId: asset,
    tokenId: asset,
  })) satisfies z.ZodType<Holder>;

export type MetaHolder = {
  /** Outcome identifier for a CTF token or Polymarket V2 position. */
  assetId: TokenId | PositionId | null | undefined;
  /** @deprecated Use `assetId`. */
  token: TokenId | PositionId | null | undefined;
  holders?: Holder[] | null;
};

export const MetaHolderSchema = z
  .object({
    token: ClobAssetIdSchema.nullish(),
    holders: z.array(HolderSchema).nullish(),
  })
  .transform(({ token, ...rest }) => ({
    ...rest,
    assetId: token,
    token,
  })) satisfies z.ZodType<MetaHolder>;

export type OpenInterest = {
  /** Condition ID of the market, or `null` for the global aggregate. */
  conditionId: ConditionId | null;
  /** Priced gross open interest in USDC. */
  value: DecimalString;
};

export const OpenInterestSchema = z
  .object({
    condition_id: z.union([ConditionIdSchema, z.literal('GLOBAL')]),
    value: DecimalishSchema,
  })
  .transform(({ condition_id, value }) => ({
    conditionId: condition_id === 'GLOBAL' ? null : condition_id,
    value,
  })) satisfies z.ZodType<OpenInterest>;

export type MarketLiveVolume = {
  /** Condition ID of the market, or `null` when the source row is unidentified. */
  conditionId: ConditionId | null;
  /** Cumulative one-side taker volume in shares. */
  takerVolume: DecimalString;
};

export const MarketLiveVolumeSchema = z
  .object({
    condition_id: z.preprocess(emptyStringToNull, ConditionIdSchema.nullable()),
    taker_volume: DecimalishSchema,
  })
  .transform(({ condition_id, taker_volume }) => ({
    conditionId: condition_id,
    takerVolume: taker_volume,
  })) satisfies z.ZodType<MarketLiveVolume>;

export type LiveVolume = {
  /** Sum of every returned market's taker volume, in shares. */
  takerVolumeTotal: DecimalString;
  /** Markets ordered by taker volume descending. */
  markets: MarketLiveVolume[];
};

export const LiveVolumeSchema = z
  .object({
    taker_volume_total: DecimalishSchema,
    conditions: z.array(MarketLiveVolumeSchema),
  })
  .transform(({ conditions, taker_volume_total }) => ({
    markets: conditions,
    takerVolumeTotal: taker_volume_total,
  })) satisfies z.ZodType<LiveVolume>;

export const ListMarketHoldersResponseSchema = z.array(MetaHolderSchema);
export const FetchOpenInterestResponseSchema = dataEnvelopeSchema(
  z.array(OpenInterestSchema),
);
export const FetchEventLiveVolumeResponseSchema =
  dataEnvelopeSchema(LiveVolumeSchema);

export type ListMarketHoldersResponse = z.infer<
  typeof ListMarketHoldersResponseSchema
>;
export type FetchOpenInterestResponse = z.infer<
  typeof FetchOpenInterestResponseSchema
>;
export type FetchEventLiveVolumeResponse = z.infer<
  typeof FetchEventLiveVolumeResponseSchema
>;
