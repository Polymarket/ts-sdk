import { z } from 'zod';
import {
  BaseUnitsSchema,
  type CtfConditionId,
  CtfConditionIdSchema,
  DecimalishSchema,
  type DecimalString,
  DecimalStringSchema,
  EpochLikeToIsoDateTimeStringSchema,
  EpochMillisecondsSchema,
  EpochMillisecondsToIsoDateTimeStringSchema,
  EvmAddressSchema,
  emptyStringToNull,
  type IsoDateTimeString,
  NotificationIdSchema,
  OptionalEpochLikeToIsoDateTimeStringSchema,
  type TokenId,
  TokenIdSchema,
  TradeStatusSchema,
} from '../shared';

function createCursorPageSchema<TItem extends z.ZodTypeAny>(item: TItem) {
  return z
    .object({
      count: z.number(),
      data: z.array(item),
      limit: z.number(),
      next_cursor: z.string(),
    })
    .transform(({ next_cursor, ...rest }) => ({
      ...rest,
      nextCursor: next_cursor,
    }));
}

export const ClosedOnlyModeSchema = z
  .object({
    closed_only: z.boolean(),
  })
  .transform(({ closed_only }) => ({
    closedOnly: closed_only,
  }));

export type ClosedOnlyMode = z.infer<typeof ClosedOnlyModeSchema>;

export type OpenOrder = {
  id: string;
  /** CTF condition id for the market associated with this order. */
  conditionId: CtfConditionId;
  tokenId: TokenId;
  owner: string;
  makerAddress: string;
  side: string;
  price: DecimalString;
  originalSize: DecimalString;
  sizeMatched: DecimalString;
  outcome: string;
  orderType: string;
  status: string;
  associateTrades: string[];
  createdAt: IsoDateTimeString;
  expiresAt?: IsoDateTimeString;
};

export const OpenOrderSchema = z
  .object({
    asset_id: TokenIdSchema,
    associate_trades: z.array(z.string()),
    created_at: EpochLikeToIsoDateTimeStringSchema,
    expiration: OptionalEpochLikeToIsoDateTimeStringSchema,
    id: z.string(),
    maker_address: z.string(),
    market: CtfConditionIdSchema,
    order_type: z.string(),
    original_size: DecimalStringSchema,
    outcome: z.string(),
    owner: z.string(),
    price: DecimalStringSchema,
    side: z.string(),
    size_matched: DecimalStringSchema,
    status: z.string(),
  })
  .transform(
    ({
      asset_id,
      associate_trades,
      created_at,
      expiration,
      maker_address,
      market,
      order_type,
      original_size,
      size_matched,
      ...rest
    }) => {
      const transformed = {
        ...rest,
        conditionId: market,
        tokenId: asset_id,
        associateTrades: associate_trades,
        createdAt: created_at,
        makerAddress: maker_address,
        orderType: order_type,
        originalSize: original_size,
        sizeMatched: size_matched,
      };

      return expiration === undefined
        ? transformed
        : { ...transformed, expiresAt: expiration };
    },
  ) satisfies z.ZodType<OpenOrder>;

export const OpenOrdersPageSchema = createCursorPageSchema(OpenOrderSchema);

export type OpenOrdersPage = z.infer<typeof OpenOrdersPageSchema>;

export const MakerOrderSchema = z
  .object({
    asset_id: TokenIdSchema,
    // The API serializes a missing maker fee rate as an empty string.
    // Normalize to null so consumers never see '' as a DecimalString. This
    // matches py-sdk, where MakerOrder.fee_rate_bps is nullable.
    fee_rate_bps: z.preprocess(
      emptyStringToNull,
      DecimalStringSchema.nullable(),
    ),
    maker_address: z.string(),
    matched_amount: DecimalStringSchema,
    order_id: z.string(),
    outcome: z.string(),
    owner: z.string(),
    price: DecimalStringSchema,
    side: z.string(),
  })
  .transform(
    ({
      asset_id,
      fee_rate_bps,
      maker_address,
      matched_amount,
      order_id,
      ...rest
    }) => ({
      ...rest,
      tokenId: asset_id,
      feeRateBps: fee_rate_bps,
      makerAddress: maker_address,
      matchedAmount: matched_amount,
      orderId: order_id,
    }),
  );

type MakerOrder = z.output<typeof MakerOrderSchema>;

export type ClobTrade = {
  id: string;
  /** CTF condition id for the market associated with this trade. */
  conditionId: CtfConditionId;
  tokenId: TokenId;
  owner: string;
  makerAddress: string;
  takerOrderId: string;
  side: string;
  traderSide: 'TAKER' | 'MAKER';
  price: DecimalString;
  size: DecimalString;
  outcome: string;
  status: string;
  feeRateBps: DecimalString;
  bucketIndex: number;
  transactionHash: string;
  makerOrders: MakerOrder[];
  matchedAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

export const ClobTradeSchema = z
  .object({
    asset_id: TokenIdSchema,
    bucket_index: z.number(),
    fee_rate_bps: DecimalStringSchema,
    id: z.string(),
    last_update: EpochLikeToIsoDateTimeStringSchema,
    maker_address: z.string(),
    maker_orders: z.array(MakerOrderSchema),
    market: CtfConditionIdSchema,
    match_time: EpochLikeToIsoDateTimeStringSchema,
    outcome: z.string(),
    owner: z.string(),
    price: DecimalStringSchema,
    side: z.string(),
    size: DecimalStringSchema,
    status: TradeStatusSchema,
    taker_order_id: z.string(),
    trader_side: z.enum(['TAKER', 'MAKER']),
    transaction_hash: z.string(),
  })
  .transform(
    ({
      asset_id,
      bucket_index,
      fee_rate_bps,
      last_update,
      maker_address,
      maker_orders,
      market,
      match_time,
      taker_order_id,
      trader_side,
      transaction_hash,
      ...rest
    }) => ({
      ...rest,
      conditionId: market,
      tokenId: asset_id,
      bucketIndex: bucket_index,
      feeRateBps: fee_rate_bps,
      updatedAt: last_update,
      makerAddress: maker_address,
      makerOrders: maker_orders,
      matchedAt: match_time,
      takerOrderId: taker_order_id,
      traderSide: trader_side,
      transactionHash: transaction_hash,
    }),
  ) satisfies z.ZodType<ClobTrade>;

export const ClobTradesPageSchema = createCursorPageSchema(ClobTradeSchema);

export type ClobTradesPage = z.infer<typeof ClobTradesPageSchema>;

const NotificationTimestampSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  return /^\d+$/.test(value) ? Number(value) : Date.parse(value);
}, EpochMillisecondsSchema);

export const NotificationSchema = z.object({
  id: NotificationIdSchema,
  owner: z.string(),
  payload: z.unknown(),
  timestamp: NotificationTimestampSchema,
  type: z.number(),
});

export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationsResponseSchema = z.array(NotificationSchema);

export type NotificationsResponse = z.infer<typeof NotificationsResponseSchema>;

export enum AssetType {
  COLLATERAL = 'COLLATERAL',
  CONDITIONAL = 'CONDITIONAL',
}

export const AssetTypeSchema = z.enum(AssetType);

export const BalanceAllowanceResponseSchema = z.object({
  allowances: z.record(EvmAddressSchema, z.string().transform(BigInt)),
  balance: BaseUnitsSchema,
});

export type BalanceAllowanceResponse = z.infer<
  typeof BalanceAllowanceResponseSchema
>;

export const OrderScoringResponseSchema = z.object({
  scoring: z.boolean(),
});

export type OrderScoringResponse = z.infer<typeof OrderScoringResponseSchema>;

export const OrdersScoringResponseSchema = z.record(z.string(), z.boolean());

export type OrdersScoringResponse = z.infer<typeof OrdersScoringResponseSchema>;

export const UserEarningSchema = z
  .object({
    asset_address: z.string(),
    asset_rate: DecimalishSchema,
    condition_id: CtfConditionIdSchema,
    date: EpochMillisecondsToIsoDateTimeStringSchema,
    earnings: DecimalishSchema,
    maker_address: z.string(),
  })
  .transform(
    ({ asset_address, asset_rate, condition_id, maker_address, ...rest }) => ({
      ...rest,
      assetAddress: asset_address,
      assetRate: asset_rate,
      conditionId: condition_id,
      makerAddress: maker_address,
    }),
  );

export type UserEarning = z.infer<typeof UserEarningSchema>;

export const UserEarningsPageSchema = createCursorPageSchema(UserEarningSchema);

export type UserEarningsPage = z.infer<typeof UserEarningsPageSchema>;

export const TotalUserEarningSchema = z
  .object({
    asset_address: z.string(),
    asset_rate: DecimalishSchema,
    date: EpochMillisecondsToIsoDateTimeStringSchema,
    earnings: DecimalishSchema,
    maker_address: z.string(),
  })
  .transform(({ asset_address, asset_rate, maker_address, ...rest }) => ({
    ...rest,
    assetAddress: asset_address,
    assetRate: asset_rate,
    makerAddress: maker_address,
  }));

export type TotalUserEarning = z.infer<typeof TotalUserEarningSchema>;

export const TotalUserEarningsResponseSchema = z.array(TotalUserEarningSchema);

export type TotalUserEarningsResponse = z.infer<
  typeof TotalUserEarningsResponseSchema
>;

export const RewardsPercentagesSchema = z.record(
  CtfConditionIdSchema,
  z.number(),
);

export type RewardsPercentages = z.infer<typeof RewardsPercentagesSchema>;

export const TokenSchema = z
  .object({
    outcome: z.string(),
    price: DecimalishSchema,
    token_id: TokenIdSchema,
  })
  .transform(({ token_id, ...rest }) => ({
    ...rest,
    tokenId: token_id,
  }));

export const RewardsConfigSchema = z
  .object({
    asset_address: z.string(),
    end_date: EpochMillisecondsToIsoDateTimeStringSchema,
    rate_per_day: DecimalishSchema,
    start_date: EpochMillisecondsToIsoDateTimeStringSchema,
    total_rewards: DecimalishSchema,
  })
  .transform(
    ({ asset_address, end_date, rate_per_day, start_date, total_rewards }) => ({
      assetAddress: asset_address,
      endDate: end_date,
      ratePerDay: rate_per_day,
      startDate: start_date,
      totalRewards: total_rewards,
    }),
  );

export const EarningSchema = z
  .object({
    asset_address: z.string(),
    asset_rate: DecimalishSchema,
    earnings: DecimalishSchema,
  })
  .transform(({ asset_address, asset_rate, ...rest }) => ({
    ...rest,
    assetAddress: asset_address,
    assetRate: asset_rate,
  }));

export const UserRewardsEarningSchema = z
  .object({
    condition_id: CtfConditionIdSchema,
    earning_percentage: z.number(),
    earnings: z.array(EarningSchema),
    event_slug: z.string(),
    image: z.string(),
    maker_address: z.string(),
    market_competitiveness: z.number(),
    market_slug: z.string(),
    question: z.string(),
    rewards_config: z.array(RewardsConfigSchema),
    rewards_max_spread: z.number(),
    rewards_min_size: DecimalishSchema,
    tokens: z.array(TokenSchema),
  })
  .transform(
    ({
      condition_id,
      earning_percentage,
      event_slug,
      maker_address,
      market_competitiveness,
      market_slug,
      rewards_config,
      rewards_max_spread,
      rewards_min_size,
      ...rest
    }) => ({
      ...rest,
      conditionId: condition_id,
      earningPercentage: earning_percentage,
      eventSlug: event_slug,
      makerAddress: maker_address,
      marketCompetitiveness: market_competitiveness,
      marketSlug: market_slug,
      rewardsConfig: rewards_config,
      rewardsMaxSpread: rewards_max_spread,
      rewardsMinSize: rewards_min_size,
    }),
  );

export type UserRewardsEarning = z.infer<typeof UserRewardsEarningSchema>;

export const UserRewardsEarningsPageSchema = createCursorPageSchema(
  UserRewardsEarningSchema,
);

export type UserRewardsEarningsPage = z.infer<
  typeof UserRewardsEarningsPageSchema
>;
