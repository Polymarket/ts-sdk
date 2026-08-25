import { z } from 'zod';
import {
  ClobAssetIdSchema,
  type ConditionId,
  ConditionIdSchema,
  DecimalishSchema,
  type DecimalString,
  type PositionId,
  type TokenId,
} from '../shared';
import { type Address, AddressSchema } from './common';

export type Holder = {
  wallet: Address | null | undefined;
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
    proxyWallet: AddressSchema.nullish(),
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
  /** Condition ID of the market whose open interest is reported. */
  conditionId: ConditionId | null | undefined;
  /** @deprecated Use `conditionId`. */
  market: ConditionId | null | undefined;
  value?: DecimalString | null;
};

export const OpenInterestSchema = z
  .object({
    market: ConditionIdSchema.nullish(),
    value: DecimalishSchema.nullish(),
  })
  .transform(({ market, ...rest }) => ({
    ...rest,
    conditionId: market,
    market,
  })) satisfies z.ZodType<OpenInterest>;

export type MarketVolume = {
  /** Condition ID of the market whose live volume is reported. */
  conditionId: ConditionId | null | undefined;
  /** @deprecated Use `conditionId`. */
  market: ConditionId | null | undefined;
  value?: DecimalString | null;
};

export const MarketVolumeSchema = z
  .object({
    market: ConditionIdSchema.nullish(),
    value: DecimalishSchema.nullish(),
  })
  .transform(({ market, ...rest }) => ({
    ...rest,
    conditionId: market,
    market,
  })) satisfies z.ZodType<MarketVolume>;

export const LiveVolumeSchema = z.object({
  total: DecimalishSchema.nullish(),
  markets: z.array(MarketVolumeSchema).nullish(),
});

export const ListMarketHoldersResponseSchema = z.array(MetaHolderSchema);
export const ListOpenInterestResponseSchema = z.array(OpenInterestSchema);
export const FetchEventLiveVolumeResponseSchema = z.array(LiveVolumeSchema);

export type LiveVolume = z.infer<typeof LiveVolumeSchema>;
export type ListMarketHoldersResponse = z.infer<
  typeof ListMarketHoldersResponseSchema
>;
export type ListOpenInterestResponse = z.infer<
  typeof ListOpenInterestResponseSchema
>;
export type FetchEventLiveVolumeResponse = z.infer<
  typeof FetchEventLiveVolumeResponseSchema
>;
