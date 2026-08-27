import type { EvmAddress } from '@polymarket/types';
import { z } from 'zod';
import {
  ClobAssetIdSchema,
  type ComboActivityId,
  ComboActivityIdSchema,
  type ComboConditionId,
  ComboConditionIdSchema,
  type ConditionId,
  ConditionIdSchema,
  type EpochMilliseconds,
  EpochSecondsToMillisecondsSchema,
  EvmAddressSchema,
  type PositionId,
  PositionIdSchema,
  type TokenId,
  type TxHash,
  TxHashSchema,
} from '../shared';
import {
  ActivityType,
  ActivityTypeSchema,
  type Side,
  SideSchema,
} from './common';
import { dataPageSchema } from './envelope';
import { type ComboPositionLeg, ComboPositionLegSchema } from './portfolio';

export enum ComboActivityType {
  Split = 'SPLIT',
  Merge = 'MERGE',
  Convert = 'CONVERT',
  Compress = 'COMPRESS',
  Wrap = 'WRAP',
  Unwrap = 'UNWRAP',
  Redeem = 'REDEEM',
}

const ComboActivityTypeSchema = z.enum(ComboActivityType);

export type ActivityBase = {
  /** Wallet address whose account history contains this activity. */
  wallet: EvmAddress;
  /** Activity time as Unix epoch milliseconds. */
  timestamp: EpochMilliseconds;
  /** Polygon transaction hash that produced or records this activity. */
  transactionHash: TxHash;
  /** Display name of the wallet owner at the time returned by the API. */
  name: string | null;
  /** Public pseudonym of the wallet owner at the time returned by the API. */
  pseudonym: string | null;
  /** Profile biography of the wallet owner at the time returned by the API. */
  bio: string | null;
  /** Source profile image URL for the wallet owner. */
  profileImage: string | null;
  /** Optimized profile image URL for the wallet owner. */
  profileImageOptimized: string | null;
};

type TradeActivityBase = ActivityBase & {
  /** A directional outcome trade. */
  type: ActivityType.TRADE;
  /** Whether this trade is for a Combo position instead of an ordinary market. */
  isCombo: boolean;
  /** Direction of the wallet's trade. */
  side: Side;
  /** Number of shares traded by the wallet. */
  shares: number;
  /** The notional value of the traded shares in USD. */
  amount: number;
  /** The execution price per share in USD. */
  price: number;
  /** Human-readable title of the traded market or Combo. */
  title: string;
  /** Icon URL for the traded market or Combo, when available. */
  icon: string | null;
};

export type ClobTradeActivity = TradeActivityBase & {
  /** Ordinary market trades are distinct from Combo position trades. */
  isCombo: false;
  /** Condition id of the market traded by the wallet. */
  conditionId: ConditionId;
  /** Outcome identifier for a CTF token or Polymarket V2 position. */
  assetId: TokenId | PositionId;
  /** @deprecated Use `assetId`. */
  tokenId: TokenId | PositionId;
  /** Display label of the outcome traded by the wallet. */
  outcome: string;
  /** Zero-based index of the outcome in the market's outcome list. */
  outcomeIndex: number;
  /** URL slug of the market traded by the wallet. */
  slug: string;
  /** URL slug of the event containing the traded market. */
  eventSlug: string;
};

export type ComboTradeActivity = TradeActivityBase & {
  /** Combo trades are protocol v2 Combo position trades. */
  isCombo: true;
  /** Combo condition id traded by the wallet. */
  conditionId: ComboConditionId;
  /** Combo position id bought or sold by the wallet. */
  positionId: PositionId;
};

export type TradeActivity = ClobTradeActivity | ComboTradeActivity;

export type SplitActivity = ActivityBase & {
  /** Splitting collateral into a complete market set. */
  type: 'SPLIT';
  /** Condition id of the market whose complete set was created. */
  conditionId: ConditionId;
  /** The collateral amount split into the complete set in USD. */
  amount: number;
  /** Human-readable title of the market whose complete set was created. */
  title: string;
  /** URL slug of the market whose complete set was created. */
  slug: string;
  /** Icon URL for the market whose complete set was created, when available. */
  icon: string | null;
  /** URL slug of the event containing the split market. */
  eventSlug: string;
};

export type MergeActivity = ActivityBase & {
  /** Merging a complete market set into collateral. */
  type: 'MERGE';
  /** Condition id of the market whose complete set was merged. */
  conditionId: ConditionId;
  /** The collateral amount received from merging the complete set in USD. */
  amount: number;
  /** Human-readable title of the market whose complete set was merged. */
  title: string;
  /** URL slug of the market whose complete set was merged. */
  slug: string;
  /** Icon URL for the market whose complete set was merged, when available. */
  icon: string | null;
  /** URL slug of the event containing the merged market. */
  eventSlug: string;
};

export type RedeemActivity = ActivityBase & {
  /** Redeeming resolved market proceeds. */
  type: 'REDEEM';
  /** Condition id of the market redeemed by the wallet. */
  conditionId: ConditionId;
  /** The proceeds redeemed from the resolved market in USD. */
  amount: number;
  /** Human-readable title of the market redeemed by the wallet. */
  title: string;
  /** URL slug of the market redeemed by the wallet. */
  slug: string;
  /** Icon URL for the market redeemed by the wallet, when available. */
  icon: string | null;
  /** URL slug of the event containing the redeemed market. */
  eventSlug: string;
};

export type ConversionActivity = ActivityBase & {
  /** A market conversion or migration activity. */
  type: 'CONVERSION';
  /** Condition id of the market involved in the conversion. */
  conditionId: ConditionId;
  /** The amount converted or migrated for the market in USD. */
  amount: number;
  /** Human-readable title of the market involved in the conversion. */
  title: string;
  /** URL slug of the market involved in the conversion. */
  slug: string;
  /** Icon URL for the market involved in the conversion, when available. */
  icon: string | null;
  /** URL slug of the event containing the converted market. */
  eventSlug: string;
};

export type MigrationActivity = ActivityBase & {
  /** A position migrated from the legacy protocol to protocol v2. */
  type: 'MIGRATION';
  /** The migrated position value in USD. */
  amount: number;
};

export type RewardActivity = ActivityBase & {
  /** An account-level reward credit. */
  type: 'REWARD';
  /** The reward amount credited to the wallet in USD. */
  amount: number;
};

export type MakerRebateActivity = ActivityBase & {
  /** An account-level maker rebate credit. */
  type: 'MAKER_REBATE';
  /** The maker rebate amount credited to the wallet in USD. */
  amount: number;
};

export type ReferralRewardActivity = ActivityBase & {
  /** An account-level referral reward credit. */
  type: 'REFERRAL_REWARD';
  /** The referral reward amount credited to the wallet in USD. */
  amount: number;
};

export type YieldActivity = ActivityBase & {
  /** An account-level yield credit. */
  type: 'YIELD';
  /** The yield amount credited to the wallet in USD. */
  amount: number;
};

export type DepositActivity = ActivityBase & {
  /** An account-level deposit credit. */
  type: 'DEPOSIT';
  /** The deposit amount credited to the wallet in USD. */
  amount: number;
};

export type WithdrawalActivity = ActivityBase & {
  /** An account-level withdrawal debit. */
  type: 'WITHDRAWAL';
  /** The withdrawal amount debited from the wallet in USD. */
  amount: number;
};

export type TakerRebateActivity = ActivityBase & {
  /** An account-level taker rebate credit. */
  type: 'TAKER_REBATE';
  /** The taker rebate amount credited to the wallet in USD. */
  amount: number;
};

export type Activity =
  | TradeActivity
  | SplitActivity
  | MergeActivity
  | RedeemActivity
  | ConversionActivity
  | MigrationActivity
  | RewardActivity
  | MakerRebateActivity
  | ReferralRewardActivity
  | YieldActivity
  | DepositActivity
  | WithdrawalActivity
  | TakerRebateActivity;

type ComboActivityBase = {
  /** Stable row id derived from the transaction hash and log index. */
  id: ComboActivityId;
  /** Normalized lifecycle activity type. */
  type: ComboActivityType;
  /** Wallet address whose account history contains this activity. */
  wallet: EvmAddress;
  /** Combo condition id involved in this activity. */
  conditionId: ComboConditionId;
  /** Combo position id involved in this activity. */
  positionId: PositionId;
  /** Amount associated with the lifecycle event in USD. */
  amount: number | null;
  /** Activity time as Unix epoch milliseconds. */
  timestamp: EpochMilliseconds;
  /** Polygon transaction hash that produced this activity. */
  transactionHash: TxHash;
  /** Polygon block number. */
  blockNumber: number;
  /** Combo legs enriched with market metadata at read time. */
  legs: ComboPositionLeg[];
};

export type ComboSplitActivity = ComboActivityBase & {
  type: ComboActivityType.Split;
};

export type ComboMergeActivity = ComboActivityBase & {
  type: ComboActivityType.Merge;
};

export type ComboConvertActivity = ComboActivityBase & {
  type: ComboActivityType.Convert;
};

export type ComboCompressActivity = ComboActivityBase & {
  type: ComboActivityType.Compress;
};

export type ComboWrapActivity = ComboActivityBase & {
  type: ComboActivityType.Wrap;
};

export type ComboUnwrapActivity = ComboActivityBase & {
  type: ComboActivityType.Unwrap;
};

export type ComboRedeemActivity = ComboActivityBase & {
  type: ComboActivityType.Redeem;
  /** Payout from the redemption in USD. Only redeem rows carry payout semantics. */
  payout: number | null;
};

export type ComboActivity =
  | ComboSplitActivity
  | ComboMergeActivity
  | ComboConvertActivity
  | ComboCompressActivity
  | ComboWrapActivity
  | ComboUnwrapActivity
  | ComboRedeemActivity;

const RawComboActivitySchema = z.object({
  id: ComboActivityIdSchema,
  type: ComboActivityTypeSchema,
  proxy_wallet: EvmAddressSchema,
  combo_condition_id: ComboConditionIdSchema,
  combo_position_id: PositionIdSchema,
  amount_usdc: z.number().nullish(),
  payout_usdc: z.number().nullish(),
  timestamp: EpochSecondsToMillisecondsSchema,
  transaction_hash: TxHashSchema,
  block_number: z.number().int(),
  legs: z.array(ComboPositionLegSchema),
});

export const ComboActivitySchema: z.ZodType<ComboActivity> =
  RawComboActivitySchema.transform(normalizeComboActivity);

const OptionalTextSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

const UnknownOutcomeIndexToUndefinedSchema = z.preprocess(
  (value) => (value === 999 ? undefined : value),
  z.number().int().optional(),
);

export type Trade = {
  wallet: EvmAddress;
  side: Side;
  /** Outcome identifier for a CTF token or Polymarket V2 position. */
  assetId: TokenId | PositionId;
  /** @deprecated Use `assetId`. */
  tokenId: TokenId | PositionId;
  conditionId: ConditionId;
  size: number;
  price: number;
  timestamp: EpochMilliseconds;
  title?: string;
  slug?: string;
  icon?: string;
  eventSlug?: string;
  outcome?: string;
  outcomeIndex?: number;
  name?: string;
  pseudonym?: string;
  bio?: string;
  profileImage?: string;
  profileImageOptimized?: string;
  transactionHash: TxHash;
};

/**
 * A trades-feed row, normalized to the SDK vocabulary.
 *
 * The wire is strict snake_case with every field present: absence arrives
 * as an empty string (normalized to `undefined` here) and an unknown outcome
 * index arrives as the sentinel `999` (also normalized to `undefined` —
 * missing is never `0`). Timestamps arrive as epoch seconds and normalize to
 * epoch milliseconds. `size` is a share count and `price` is USD per share.
 * The asset is a CTF token id or a Polymarket V2 position id.
 */
export const TradeSchema = z
  .object({
    proxy_wallet: EvmAddressSchema,
    side: SideSchema,
    token_id: ClobAssetIdSchema,
    condition_id: ConditionIdSchema,
    size: z.number(),
    price: z.number(),
    timestamp: EpochSecondsToMillisecondsSchema,
    title: OptionalTextSchema,
    slug: OptionalTextSchema,
    icon: OptionalTextSchema,
    event_slug: OptionalTextSchema,
    outcome: OptionalTextSchema,
    outcome_index: UnknownOutcomeIndexToUndefinedSchema,
    name: OptionalTextSchema,
    pseudonym: OptionalTextSchema,
    bio: OptionalTextSchema,
    profile_image: OptionalTextSchema,
    profile_image_optimized: OptionalTextSchema,
    transaction_hash: TxHashSchema,
  })
  .transform((trade) => ({
    wallet: trade.proxy_wallet,
    side: trade.side,
    assetId: trade.token_id,
    tokenId: trade.token_id,
    conditionId: trade.condition_id,
    size: trade.size,
    price: trade.price,
    timestamp: trade.timestamp,
    title: trade.title,
    slug: trade.slug,
    icon: trade.icon,
    eventSlug: trade.event_slug,
    outcome: trade.outcome,
    outcomeIndex: trade.outcome_index,
    name: trade.name,
    pseudonym: trade.pseudonym,
    bio: trade.bio,
    profileImage: trade.profile_image,
    profileImageOptimized: trade.profile_image_optimized,
    transactionHash: trade.transaction_hash,
  })) satisfies z.ZodType<Trade>;

const RawActivitySchema = z.object({
  proxy_wallet: EvmAddressSchema,
  timestamp: EpochSecondsToMillisecondsSchema,
  condition_id: z.preprocess(
    (value) => (value === '' ? undefined : value),
    ConditionIdSchema.optional(),
  ),
  type: ActivityTypeSchema,
  size: z.number(),
  usdc_size: z.number(),
  transaction_hash: TxHashSchema,
  price: z.number(),
  token_id: z.preprocess(
    (value) => (value === '' ? undefined : value),
    ClobAssetIdSchema.optional(),
  ),
  side: z.preprocess(
    (value) => (value === '' ? undefined : value),
    SideSchema.optional(),
  ),
  // Flag only, present on V2/V3 combo trade rows and omitted otherwise.
  is_combo: z.boolean().optional(),
  outcome_index: UnknownOutcomeIndexToUndefinedSchema,
  title: OptionalTextSchema,
  slug: OptionalTextSchema,
  icon: OptionalTextSchema,
  event_slug: OptionalTextSchema,
  outcome: OptionalTextSchema,
  name: OptionalTextSchema,
  pseudonym: OptionalTextSchema,
  bio: OptionalTextSchema,
  profile_image: OptionalTextSchema,
  profile_image_optimized: OptionalTextSchema,
});

export const ActivitySchema: z.ZodType<Activity> =
  RawActivitySchema.transform(normalizeActivity);

export const TradedSchema = z.object({
  user: EvmAddressSchema.nullish(),
  traded: z.number().int().nullish(),
});

export const ListTradesResponseSchema = dataPageSchema(TradeSchema);
export const ListActivityResponseSchema = dataPageSchema(ActivitySchema);
export const ListComboActivityResponseSchema =
  dataPageSchema(ComboActivitySchema);

export type Traded = z.infer<typeof TradedSchema>;
export type ListTradesResponse = z.infer<typeof ListTradesResponseSchema>;
export type ListActivityResponse = z.infer<typeof ListActivityResponseSchema>;
export type ListComboActivityResponse = z.infer<
  typeof ListComboActivityResponseSchema
>;

type RawComboActivity = z.infer<typeof RawComboActivitySchema>;
type RawActivity = z.infer<typeof RawActivitySchema>;

function normalizeComboActivity(activity: RawComboActivity): ComboActivity {
  const base = normalizeComboActivityBase(activity);

  switch (activity.type) {
    case ComboActivityType.Split:
      return { ...base, type: ComboActivityType.Split };
    case ComboActivityType.Merge:
      return { ...base, type: ComboActivityType.Merge };
    case ComboActivityType.Convert:
      return { ...base, type: ComboActivityType.Convert };
    case ComboActivityType.Compress:
      return { ...base, type: ComboActivityType.Compress };
    case ComboActivityType.Wrap:
      return { ...base, type: ComboActivityType.Wrap };
    case ComboActivityType.Unwrap:
      return { ...base, type: ComboActivityType.Unwrap };
    case ComboActivityType.Redeem:
      return {
        ...base,
        type: ComboActivityType.Redeem,
        payout: activity.payout_usdc ?? null,
      };
  }
}

function normalizeComboActivityBase(
  activity: RawComboActivity,
): ComboActivityBase {
  return {
    id: activity.id,
    type: activity.type,
    wallet: activity.proxy_wallet,
    conditionId: activity.combo_condition_id,
    positionId: activity.combo_position_id,
    amount: activity.amount_usdc ?? null,
    timestamp: activity.timestamp,
    transactionHash: activity.transaction_hash,
    blockNumber: activity.block_number,
    legs: activity.legs,
  };
}

function normalizeActivity(activity: RawActivity): Activity {
  const base = normalizeActivityBase(activity);

  switch (activity.type) {
    case ActivityType.TRADE:
      return normalizeTradeActivity(activity, base);
    case ActivityType.SPLIT:
    case ActivityType.MERGE:
    case ActivityType.REDEEM:
    case ActivityType.CONVERSION:
      return {
        ...base,
        type: activity.type,
        conditionId: expectPresent(activity.condition_id, 'condition_id'),
        amount: activity.usdc_size,
        title: expectPresent(activity.title, 'title'),
        slug: expectPresent(activity.slug, 'slug'),
        icon: activity.icon ?? null,
        eventSlug: expectPresent(activity.event_slug, 'event_slug'),
      };
    case ActivityType.MIGRATION:
    case ActivityType.REWARD:
    case ActivityType.MAKER_REBATE:
    case ActivityType.REFERRAL_REWARD:
    case ActivityType.YIELD:
    case ActivityType.DEPOSIT:
    case ActivityType.WITHDRAWAL:
    case ActivityType.TAKER_REBATE:
      return {
        ...base,
        type: activity.type,
        amount: activity.usdc_size,
      };
  }
}

function normalizeTradeActivity(
  activity: RawActivity,
  base: ActivityBase,
): TradeActivity {
  const trade = {
    ...base,
    type: ActivityType.TRADE as ActivityType.TRADE,
    side: expectPresent(activity.side, 'side'),
    shares: activity.size,
    amount: activity.usdc_size,
    price: activity.price,
    title: expectPresent(activity.title, 'title'),
    icon: activity.icon ?? null,
  };

  if (activity.is_combo === true) {
    return {
      ...trade,
      isCombo: true,
      conditionId: ComboConditionIdSchema.parse(
        expectPresent(activity.condition_id, 'condition_id'),
      ),
      positionId: PositionIdSchema.parse(
        expectPresent(activity.token_id, 'token_id'),
      ),
    };
  }

  const assetId = expectPresent(activity.token_id, 'token_id');

  return {
    ...trade,
    isCombo: false,
    conditionId: expectPresent(activity.condition_id, 'condition_id'),
    assetId,
    tokenId: assetId,
    outcome: expectPresent(activity.outcome, 'outcome'),
    outcomeIndex: expectPresent(activity.outcome_index, 'outcome_index'),
    slug: expectPresent(activity.slug, 'slug'),
    eventSlug: expectPresent(activity.event_slug, 'event_slug'),
  };
}

function normalizeActivityBase(activity: RawActivity): ActivityBase {
  return {
    wallet: activity.proxy_wallet,
    timestamp: activity.timestamp,
    transactionHash: activity.transaction_hash,
    name: activity.name ?? null,
    pseudonym: activity.pseudonym ?? null,
    bio: activity.bio ?? null,
    profileImage: activity.profile_image ?? null,
    profileImageOptimized: activity.profile_image_optimized ?? null,
  };
}

function expectPresent<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) {
    throw new TypeError(`Expected activity.${field} to be present`);
  }

  return value;
}
