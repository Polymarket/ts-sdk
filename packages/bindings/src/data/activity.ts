import { z } from 'zod';
import {
  type ConditionId,
  ConditionIdSchema,
  DecimalishSchema,
  type DecimalString,
  type EpochMilliseconds,
  EpochSecondsToMillisecondsSchema,
  type TokenId,
  TokenIdSchema,
  type TxHash,
  TxHashSchema,
} from '../shared';
import {
  ActivityType,
  ActivityTypeSchema,
  type Address,
  AddressSchema,
  type Side,
  SideSchema,
} from './common';

export type ActivityBase = {
  /** Wallet address whose account history contains this activity. */
  wallet: Address;
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

export type TradeActivity = ActivityBase & {
  /** A directional outcome-token trade. */
  type: 'TRADE';
  /** Condition id of the market traded by the wallet. */
  conditionId: ConditionId;
  /** Outcome token id bought or sold by the wallet. */
  tokenId: TokenId;
  /** Direction of the wallet's trade in the outcome token. */
  side: Side;
  /** Number of outcome-token shares traded by the wallet. */
  shares: DecimalString;
  /** The notional value of the traded shares in USD. */
  amount: DecimalString;
  /** The execution price per outcome-token share in USD. */
  price: DecimalString;
  /** Display label of the outcome token traded by the wallet. */
  outcome: string;
  /** Zero-based index of the outcome token in the market's outcome list. */
  outcomeIndex: number;
  /** Human-readable title of the market traded by the wallet. */
  title: string;
  /** URL slug of the market traded by the wallet. */
  slug: string;
  /** Icon URL for the market traded by the wallet, when available. */
  icon: string | null;
  /** URL slug of the event containing the traded market. */
  eventSlug: string;
};

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

export type Activity =
  | TradeActivity
  | SplitActivity
  | MergeActivity
  | RedeemActivity
  | ConversionActivity
  | RewardActivity
  | MakerRebateActivity
  | ReferralRewardActivity
  | YieldActivity;

const OptionalTextSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

export const TradeSchema = z
  .object({
    proxyWallet: AddressSchema.nullish(),
    side: SideSchema.nullish(),
    asset: TokenIdSchema.nullish(),
    conditionId: ConditionIdSchema.nullish(),
    size: DecimalishSchema.nullish(),
    price: DecimalishSchema.nullish(),
    timestamp: EpochSecondsToMillisecondsSchema.nullish(),
    title: z.string().nullish(),
    slug: z.string().nullish(),
    icon: z.string().nullish(),
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
    tokenId: asset,
  }));

const RawActivitySchema = z.object({
  proxyWallet: AddressSchema.nullish(),
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
    TokenIdSchema.optional(),
  ),
  side: z.preprocess(
    (value) => (value === '' ? undefined : value),
    SideSchema.nullish(),
  ),
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
  user: AddressSchema.nullish(),
  traded: z.number().int().nullish(),
});

export const ListTradesResponseSchema = z.array(TradeSchema);
export const ListActivityResponseSchema = z.array(ActivitySchema);

export type Trade = z.infer<typeof TradeSchema>;
export type Traded = z.infer<typeof TradedSchema>;
export type ListTradesResponse = z.infer<typeof ListTradesResponseSchema>;
export type ListActivityResponse = z.infer<typeof ListActivityResponseSchema>;

type RawActivity = z.infer<typeof RawActivitySchema>;

function normalizeActivity(activity: RawActivity): Activity {
  const base = normalizeActivityBase(activity);

  switch (activity.type) {
    case ActivityType.TRADE:
      return {
        ...base,
        type: activity.type,
        conditionId: expectPresent(activity.conditionId, 'conditionId'),
        tokenId: expectPresent(activity.asset, 'asset'),
        side: expectPresent(activity.side, 'side'),
        shares: expectPresent(activity.size, 'size'),
        amount: inferAmount(activity),
        price: expectPresent(activity.price, 'price'),
        outcome: expectPresent(activity.outcome, 'outcome'),
        outcomeIndex: expectPresent(activity.outcomeIndex, 'outcomeIndex'),
        title: expectPresent(activity.title, 'title'),
        slug: expectPresent(activity.slug, 'slug'),
        icon: activity.icon ?? null,
        eventSlug: expectPresent(activity.eventSlug, 'eventSlug'),
      };
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
    case ActivityType.REWARD:
    case ActivityType.MAKER_REBATE:
    case ActivityType.REFERRAL_REWARD:
    case ActivityType.YIELD:
      return {
        ...base,
        type: activity.type,
        amount: inferAmount(activity),
      };
  }
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
