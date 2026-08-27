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
  DecimalishSchema,
  type DecimalString,
  type EpochMilliseconds,
  EpochSecondsToMillisecondsSchema,
  EvmAddressSchema,
  emptyStringToNull,
  type IsoDateTimeString,
  IsoDateTimeStringSchema,
  PaginationCursorSchema,
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
  shares: DecimalString;
  /** The notional value of the traded shares in USD. */
  amount: DecimalString;
  /** The execution price per share in USD. */
  price: DecimalString;
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
  amount: DecimalString;
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
  amount: DecimalString;
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
  amount: DecimalString;
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
  amount: DecimalString;
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
  amount: DecimalString;
};

export type RewardActivity = ActivityBase & {
  /** An account-level reward credit. */
  type: 'REWARD';
  /** The reward amount credited to the wallet in USD. */
  amount: DecimalString;
};

export type MakerRebateActivity = ActivityBase & {
  /** An account-level maker rebate credit. */
  type: 'MAKER_REBATE';
  /** The maker rebate amount credited to the wallet in USD. */
  amount: DecimalString;
};

export type ReferralRewardActivity = ActivityBase & {
  /** An account-level referral reward credit. */
  type: 'REFERRAL_REWARD';
  /** The referral reward amount credited to the wallet in USD. */
  amount: DecimalString;
};

export type YieldActivity = ActivityBase & {
  /** An account-level yield credit. */
  type: 'YIELD';
  /** The yield amount credited to the wallet in USD. */
  amount: DecimalString;
};

export type DepositActivity = ActivityBase & {
  /** An account-level deposit credit. */
  type: 'DEPOSIT';
  /** The deposit amount credited to the wallet in USD. */
  amount: DecimalString;
};

export type WithdrawalActivity = ActivityBase & {
  /** An account-level withdrawal debit. */
  type: 'WITHDRAWAL';
  /** The withdrawal amount debited from the wallet in USD. */
  amount: DecimalString;
};

export type TakerRebateActivity = ActivityBase & {
  /** An account-level taker rebate credit. */
  type: 'TAKER_REBATE';
  /** The taker rebate amount credited to the wallet in USD. */
  amount: DecimalString;
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
  /** Combo module id. */
  moduleId: number;
  /** Amount associated with the lifecycle event in USD. */
  amount: DecimalString | null;
  /** Activity time as Unix epoch milliseconds. */
  timestamp: EpochMilliseconds;
  /** Activity transaction time as an ISO date-time string. */
  transactionAt: IsoDateTimeString;
  /** Polygon transaction hash that produced this activity. */
  transactionHash: TxHash;
  /** Log index within the transaction. */
  logIndex: number;
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
  /** Redeemed Combo position id. Only redeem rows carry a source position id. */
  positionId: PositionId;
  /** Payout from the redemption in USD. Only redeem rows carry payout semantics. */
  payout: DecimalString | null;
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
  user_address: EvmAddressSchema,
  combo_condition_id: ComboConditionIdSchema,
  combo_position_id: PositionIdSchema,
  module_id: z.number().int(),
  amount_usdc: DecimalishSchema.nullable(),
  payout_usdc: DecimalishSchema.nullable(),
  timestamp: EpochSecondsToMillisecondsSchema,
  tx_dttm: IsoDateTimeStringSchema,
  tx_hash: TxHashSchema,
  log_index: z.number().int(),
  block_number: z.number().int(),
  legs: z.array(ComboPositionLegSchema),
});

export const ComboActivitySchema: z.ZodType<ComboActivity> =
  RawComboActivitySchema.transform(normalizeComboActivity);

const OptionalTextSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

export type Trade = {
  wallet: EvmAddress | null | undefined;
  /** Outcome identifier for a CTF token or Polymarket V2 position. */
  assetId: TokenId | PositionId | null | undefined;
  /** @deprecated Use `assetId`. */
  tokenId: TokenId | PositionId | null | undefined;
  side?: Side | null;
  conditionId?: ConditionId | null;
  size?: DecimalString | null;
  price?: DecimalString | null;
  timestamp?: EpochMilliseconds | null;
  title?: string | null;
  slug?: string | null;
  icon?: string | null;
  eventSlug?: string | null;
  outcome?: string | null;
  outcomeIndex?: number | null;
  name?: string | null;
  pseudonym?: string | null;
  bio?: string | null;
  profileImage?: string | null;
  profileImageOptimized?: string | null;
  transactionHash?: string | null;
};

export const TradeSchema = z
  .object({
    proxyWallet: EvmAddressSchema.nullish(),
    side: SideSchema.nullish(),
    asset: ClobAssetIdSchema.nullish(),
    conditionId: ConditionIdSchema.nullish(),
    size: DecimalishSchema.nullish(),
    price: DecimalishSchema.nullish(),
    timestamp: EpochSecondsToMillisecondsSchema.nullish(),
    title: z.string().nullish(),
    slug: z.string().nullish(),
    icon: z.preprocess(emptyStringToNull, z.string().nullish()),
    eventSlug: z.string().nullish(),
    outcome: z.string().nullish(),
    outcomeIndex: z.number().int().nullish(),
    name: z.string().nullish(),
    pseudonym: z.string().nullish(),
    bio: z.string().nullish(),
    profileImage: z.string().nullish(),
    profileImageOptimized: z.string().nullish(),
    transactionHash: z.string().nullish(),
  })
  .transform(({ asset, proxyWallet, ...rest }) => ({
    ...rest,
    wallet: proxyWallet,
    assetId: asset,
    tokenId: asset,
  })) satisfies z.ZodType<Trade>;

const RawActivitySchema = z.object({
  proxyWallet: EvmAddressSchema.nullish(),
  timestamp: EpochSecondsToMillisecondsSchema.nullish(),
  conditionId: z.preprocess(
    (value) => (value === '' ? undefined : value),
    ConditionIdSchema.optional(),
  ),
  type: ActivityTypeSchema,
  size: DecimalishSchema.nullish(),
  usdcSize: DecimalishSchema.nullish(),
  transactionHash: TxHashSchema.nullish(),
  price: DecimalishSchema.nullish(),
  asset: z.preprocess(
    (value) => (value === '' ? undefined : value),
    ClobAssetIdSchema.optional(),
  ),
  side: z.preprocess(
    (value) => (value === '' ? undefined : value),
    SideSchema.nullish(),
  ),
  isCombo: z.boolean().optional(),
  outcomeIndex: z.preprocess(
    (value) => (value === 999 ? undefined : value),
    z.number().int().optional(),
  ),
  title: OptionalTextSchema,
  slug: OptionalTextSchema,
  icon: OptionalTextSchema,
  eventSlug: OptionalTextSchema,
  outcome: OptionalTextSchema,
  name: OptionalTextSchema,
  pseudonym: OptionalTextSchema,
  bio: OptionalTextSchema,
  profileImage: OptionalTextSchema,
  profileImageOptimized: OptionalTextSchema,
});

export const ActivitySchema: z.ZodType<Activity> =
  RawActivitySchema.transform(normalizeActivity);

export const TradedSchema = z.object({
  user: EvmAddressSchema.nullish(),
  traded: z.number().int().nullish(),
});

export const ListTradesResponseSchema = z.array(TradeSchema);
export const ListActivityResponseSchema = z.array(ActivitySchema);
export const ListComboActivityResponseSchema = z
  .object({
    activity: z.array(ComboActivitySchema),
    pagination: z.object({
      limit: z.number().int(),
      offset: z.number().int(),
      has_more: z.boolean(),
      next_cursor: PaginationCursorSchema.nullish(),
    }),
  })
  .transform(({ pagination, ...rest }) => ({
    ...rest,
    pagination: {
      limit: pagination.limit,
      offset: pagination.offset,
      hasMore: pagination.has_more,
      nextCursor: pagination.next_cursor,
    },
  }));

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
        positionId: activity.combo_position_id,
        payout: activity.payout_usdc,
      };
  }
}

function normalizeComboActivityBase(
  activity: RawComboActivity,
): ComboActivityBase {
  return {
    id: activity.id,
    type: activity.type,
    wallet: activity.user_address,
    conditionId: activity.combo_condition_id,
    moduleId: activity.module_id,
    amount: activity.amount_usdc,
    timestamp: activity.timestamp,
    transactionAt: activity.tx_dttm,
    transactionHash: activity.tx_hash,
    logIndex: activity.log_index,
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
        conditionId: expectPresent(activity.conditionId, 'conditionId'),
        amount: inferAmount(activity),
        title: expectPresent(activity.title, 'title'),
        slug: expectPresent(activity.slug, 'slug'),
        icon: activity.icon ?? null,
        eventSlug: expectPresent(activity.eventSlug, 'eventSlug'),
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
        amount: inferAmount(activity),
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
    shares: expectPresent(activity.size, 'size'),
    amount: inferAmount(activity),
    price: expectPresent(activity.price, 'price'),
    title: expectPresent(activity.title, 'title'),
    icon: activity.icon ?? null,
  };

  if (activity.isCombo === true) {
    return {
      ...trade,
      isCombo: true,
      conditionId: ComboConditionIdSchema.parse(
        expectPresent(activity.conditionId, 'conditionId'),
      ),
      positionId: PositionIdSchema.parse(
        expectPresent(activity.asset, 'asset'),
      ),
    };
  }

  const assetId = expectPresent(activity.asset, 'asset');

  return {
    ...trade,
    isCombo: false,
    conditionId: expectPresent(activity.conditionId, 'conditionId'),
    assetId,
    tokenId: assetId,
    outcome: expectPresent(activity.outcome, 'outcome'),
    outcomeIndex: expectPresent(activity.outcomeIndex, 'outcomeIndex'),
    slug: expectPresent(activity.slug, 'slug'),
    eventSlug: expectPresent(activity.eventSlug, 'eventSlug'),
  };
}

function normalizeActivityBase(activity: RawActivity): ActivityBase {
  return {
    wallet: expectPresent(activity.proxyWallet, 'proxyWallet'),
    timestamp: expectPresent(activity.timestamp, 'timestamp'),
    transactionHash: expectPresent(activity.transactionHash, 'transactionHash'),
    name: activity.name ?? null,
    pseudonym: activity.pseudonym ?? null,
    bio: activity.bio ?? null,
    profileImage: activity.profileImage ?? null,
    profileImageOptimized: activity.profileImageOptimized ?? null,
  };
}

function inferAmount(activity: RawActivity): DecimalString {
  return expectPresent(activity.usdcSize ?? activity.size, 'usdcSize');
}

function expectPresent<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) {
    throw new TypeError(`Expected activity.${field} to be present`);
  }

  return value;
}
