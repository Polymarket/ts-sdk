import type { EvmAddress } from '@polymarket/types';
import { z } from 'zod';
import {
  ClobAssetIdSchema,
  type ConditionId,
  ConditionIdSchema,
  DecimalishSchema,
  type DecimalString,
  type EpochMilliseconds,
  EpochSecondsToMillisecondsSchema,
  EvmAddressSchema,
  emptyStringToNull,
  type PositionId,
  type TokenId,
} from '../shared';
import { dataEnvelopeSchema, dataPageSchema } from './envelope';

/** Relative window for a token's price history. */
export enum PriceHistoryInterval {
  Max = 'max',
  OneMonth = '1m',
  OneWeek = '1w',
  OneDay = '1d',
  SixHours = '6h',
  OneHour = '1h',
}

export const PriceHistoryIntervalSchema = z.enum(PriceHistoryInterval);

export type PriceHistoryPoint = {
  /** Observation time as Unix epoch milliseconds. */
  timestamp: EpochMilliseconds;
  /** Observed price, normalized to a decimal string. */
  price: DecimalString;
  /** Width of the observation window in seconds; zero identifies an exact tick. */
  resolutionSeconds: number;
};

export const PriceHistoryPointSchema = z
  .object({
    timestamp: EpochSecondsToMillisecondsSchema,
    price: DecimalishSchema,
    resolution_seconds: z.number().int().nonnegative(),
  })
  .transform(({ price, resolution_seconds, timestamp }) => ({
    timestamp,
    price,
    resolutionSeconds: resolution_seconds,
  })) satisfies z.ZodType<PriceHistoryPoint>;

export const ListPriceHistoryResponseSchema = dataPageSchema(
  PriceHistoryPointSchema,
);
export type ListPriceHistoryResponse = z.infer<
  typeof ListPriceHistoryResponseSchema
>;

export type Holder = {
  wallet: EvmAddress;
  /** Outcome identifier for a CTF token or Polymarket V2 position. */
  assetId: TokenId | PositionId;
  /** @deprecated Use `assetId`. */
  tokenId: TokenId | PositionId;
  /** Holding in shares: net by default, per-side gross with PnL included. */
  amount: DecimalString;
  displayUsernamePublic: boolean;
  outcomeIndex: number | null;
  verified: boolean;
  bio: string | null;
  pseudonym: string | null;
  name: string | null;
  profileImage: string | null;
  profileImageOptimized: string | null;
  /** Historical entry price per share, when PnL is included. */
  avgPrice?: DecimalString | null;
  /** Fee-exclusive entry cost in USDC, when PnL is included. */
  entryCostUsdc?: DecimalString | null;
  /** Current outcome price, when PnL is included. */
  currentPrice?: DecimalString | null;
  /** Current holding value in USDC, when PnL is included. */
  currentValue?: DecimalString | null;
  /** Realized PnL in USDC, when PnL is included. */
  realizedPnl?: DecimalString | null;
  /** Unrealized PnL in USDC, when PnL is included. */
  unrealizedPnl?: DecimalString | null;
  /** Total PnL in USDC, when PnL is included. */
  totalPnl?: DecimalString | null;
};

const NullableHolderTextSchema = z.preprocess(
  (value) => (value === '' ? null : value),
  z.string().nullable(),
);

export const HolderSchema = z
  .object({
    proxy_wallet: EvmAddressSchema,
    bio: NullableHolderTextSchema,
    token_id: ClobAssetIdSchema,
    pseudonym: NullableHolderTextSchema,
    amount: DecimalishSchema,
    display_username_public: z.boolean(),
    outcome_index: z.preprocess(
      (value) => (value === 999 ? null : value),
      z.number().int().nullable(),
    ),
    name: NullableHolderTextSchema,
    profile_image: NullableHolderTextSchema,
    profile_image_optimized: NullableHolderTextSchema,
    verified: z.boolean(),
    avg_price: DecimalishSchema.nullish(),
    entry_cost_usdc: DecimalishSchema.nullish(),
    current_price: DecimalishSchema.nullish(),
    current_value: DecimalishSchema.nullish(),
    realized_pnl: DecimalishSchema.nullish(),
    unrealized_pnl: DecimalishSchema.nullish(),
    total_pnl: DecimalishSchema.nullish(),
  })
  .transform((holder) => ({
    wallet: holder.proxy_wallet,
    assetId: holder.token_id,
    tokenId: holder.token_id,
    amount: holder.amount,
    displayUsernamePublic: holder.display_username_public,
    outcomeIndex: holder.outcome_index,
    verified: holder.verified,
    bio: holder.bio,
    pseudonym: holder.pseudonym,
    name: holder.name,
    profileImage: holder.profile_image,
    profileImageOptimized: holder.profile_image_optimized,
    avgPrice: holder.avg_price,
    entryCostUsdc: holder.entry_cost_usdc,
    currentPrice: holder.current_price,
    currentValue: holder.current_value,
    realizedPnl: holder.realized_pnl,
    unrealizedPnl: holder.unrealized_pnl,
    totalPnl: holder.total_pnl,
  })) satisfies z.ZodType<Holder>;

export type MetaHolder = {
  /** Outcome identifier for a CTF token or Polymarket V2 position. */
  assetId: TokenId | PositionId;
  /** @deprecated Use `assetId`. */
  token: TokenId | PositionId;
  /** Holders for this outcome, ordered by amount descending. */
  holders: Holder[];
};

export const MetaHolderSchema = z
  .object({
    token_id: ClobAssetIdSchema,
    holders: z.array(HolderSchema),
  })
  .transform(({ holders, token_id }) => ({
    assetId: token_id,
    token: token_id,
    holders,
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

export const ListMarketHoldersResponseSchema = dataPageSchema(MetaHolderSchema);
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
