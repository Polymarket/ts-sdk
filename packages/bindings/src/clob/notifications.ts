import { z } from 'zod';
import { CommentProfileSchema } from '../gamma/comment';
import {
  ApiKeySchema,
  ComboConditionIdSchema,
  CommentIdSchema,
  CommentParentEntityTypeSchema,
  ConditionIdSchema,
  DateLikeToIsoDateTimeStringSchema,
  DecimalishSchema,
  DecimalStringSchema,
  EpochMillisecondsSchema,
  EvmAddressSchema,
  IsoDateTimeStringSchema,
  NotificationIdSchema,
  OrderIdSchema,
  OrderSideSchema,
  OrderTypeSchema,
  PositionIdSchema,
  QuestionIdSchema,
  TokenIdSchema,
  TxHashSchema,
} from '../shared';

/**
 * Kind of account notification. The wire value is an integer discriminant;
 * each kind carries a payload whose shape is tied to the kind.
 */
export enum NotificationType {
  ORDER_CANCELLATION = 1,
  ORDER_FILL = 2,
  MARKET_REGISTERED = 3,
  MARKET_RESOLVED = 4,
  REWARD_PAYOUT = 5,
  CHILD_COMMENT_CREATED = 6,
  YIELD_PAYOUT = 7,
  ORDER_FILL_FAILED = 8,
  AUTO_REDEEMED = 9,
  COMBO_AUTO_REDEEMED = 10,
}

export const NotificationTypeSchema = z.enum(NotificationType);

/**
 * Preprocess helper for upstream fields that serialize missing values as
 * empty strings and whose populated form is a validated format that rejects
 * `''`. Normalizes `''` to `undefined` so the field can parse as optional.
 */
function emptyStringToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value;
}

/**
 * Payload of an order lifecycle notification (cancellation, fill, and
 * failed fill share this shape).
 *
 * `transactionHash` and `tradeId` are only populated on fills. The
 * market-display fields (`question`, `marketSlug`, `icon`, `image`,
 * `eventSlug`, `seriesSlug`) are filled best-effort by the producer and may
 * be empty strings; older notifications may omit them entirely, along with
 * `orderType`.
 */
export const OrderNotificationPayloadSchema = z
  .object({
    asset_id: TokenIdSchema,
    eventSlug: z.string().optional(),
    icon: z.string().optional(),
    image: z.string().optional(),
    market: ConditionIdSchema,
    market_slug: z.string().optional(),
    matched_size: DecimalStringSchema,
    order_id: OrderIdSchema,
    original_size: DecimalStringSchema,
    outcome: z.string(),
    outcome_index: z.number().int(),
    price: DecimalStringSchema,
    question: z.string().optional(),
    remaining_size: DecimalStringSchema,
    seriesSlug: z.string().optional(),
    side: OrderSideSchema,
    trade_id: z.preprocess(emptyStringToUndefined, z.string().optional()),
    transaction_hash: z.preprocess(
      emptyStringToUndefined,
      TxHashSchema.optional(),
    ),
    type: z.preprocess(emptyStringToUndefined, OrderTypeSchema.optional()),
  })
  .transform(
    ({
      asset_id,
      market,
      market_slug,
      matched_size,
      order_id,
      original_size,
      outcome_index,
      remaining_size,
      trade_id,
      transaction_hash,
      type,
      ...rest
    }) => ({
      ...rest,
      conditionId: market,
      tokenId: asset_id,
      marketSlug: market_slug,
      matchedSize: matched_size,
      orderId: order_id,
      orderType: type,
      originalSize: original_size,
      outcomeIndex: outcome_index,
      remainingSize: remaining_size,
      tradeId: trade_id,
      transactionHash: transaction_hash,
    }),
  );

export type OrderNotificationPayload = z.infer<
  typeof OrderNotificationPayloadSchema
>;

/**
 * One outcome token inside a market lifecycle notification payload. On a
 * market-resolved notification, `winner` marks the winning outcome.
 */
export const MarketNotificationTokenSchema = z
  .object({
    outcome: z.string(),
    price: DecimalishSchema.optional(),
    token_id: TokenIdSchema,
    winner: z.boolean(),
  })
  .transform(({ token_id, ...rest }) => ({
    ...rest,
    tokenId: token_id,
  }));

export type MarketNotificationToken = z.infer<
  typeof MarketNotificationTokenSchema
>;

/** Liquidity-rewards parameters carried on a market lifecycle notification. */
export const MarketNotificationRewardsSchema = z
  .object({
    max_spread: z.number(),
    min_size: DecimalishSchema,
    rates: z
      .array(
        z
          .object({
            asset_address: z.string(),
            rewards_daily_rate: DecimalishSchema,
          })
          .transform(({ asset_address, rewards_daily_rate }) => ({
            assetAddress: asset_address,
            dailyRate: rewards_daily_rate,
          })),
      )
      .nullish(),
  })
  .transform(({ max_spread, min_size, ...rest }) => ({
    ...rest,
    maxSpread: max_spread,
    minSize: min_size,
  }));

export type MarketNotificationRewards = z.infer<
  typeof MarketNotificationRewardsSchema
>;

/**
 * Payload of a market lifecycle notification (market registered and market
 * resolved share this shape: the market the notification is about).
 *
 * Fields marked optional are absent on notifications written before the
 * producer started including them.
 */
export const MarketNotificationPayloadSchema = z
  .object({
    accepting_order_timestamp: DateLikeToIsoDateTimeStringSchema.nullish(),
    accepting_orders: z.boolean(),
    active: z.boolean(),
    archived: z.boolean().optional(),
    closed: z.boolean(),
    condition_id: ConditionIdSchema,
    description: z.string(),
    enable_order_book: z.boolean().optional(),
    end_date_iso: DateLikeToIsoDateTimeStringSchema.nullish(),
    eventSlug: z.string().optional(),
    fpmm: z.string(),
    game_start_time: DateLikeToIsoDateTimeStringSchema.nullish(),
    icon: z.string(),
    image: z.string(),
    is_50_50_outcome: z.boolean().optional(),
    maker_base_fee: z.number().nullable(),
    market_slug: z.string(),
    minimum_order_size: DecimalishSchema,
    minimum_tick_size: DecimalishSchema,
    neg_risk: z.boolean().optional(),
    neg_risk_market_id: z.string().optional(),
    neg_risk_request_id: z.string().optional(),
    notifications_enabled: z.boolean().optional(),
    question: z.string(),
    question_id: QuestionIdSchema,
    rewards: MarketNotificationRewardsSchema.optional(),
    seconds_delay: z.number().int(),
    tags: z.array(z.string()).nullish(),
    taker_base_fee: z.number().nullable(),
    tokens: z.array(MarketNotificationTokenSchema),
  })
  .transform(
    ({
      accepting_order_timestamp,
      accepting_orders,
      condition_id,
      enable_order_book,
      end_date_iso,
      game_start_time,
      is_50_50_outcome,
      maker_base_fee,
      market_slug,
      minimum_order_size,
      minimum_tick_size,
      neg_risk,
      neg_risk_market_id,
      neg_risk_request_id,
      notifications_enabled,
      question_id,
      seconds_delay,
      taker_base_fee,
      ...rest
    }) => ({
      ...rest,
      acceptingOrders: accepting_orders,
      acceptingOrdersTimestamp: accepting_order_timestamp,
      conditionId: condition_id,
      enableOrderBook: enable_order_book,
      endDate: end_date_iso,
      gameStartTime: game_start_time,
      is5050Outcome: is_50_50_outcome,
      makerBaseFee: maker_base_fee,
      marketSlug: market_slug,
      minimumOrderSize: minimum_order_size,
      minimumTickSize: minimum_tick_size,
      negRisk: neg_risk,
      negRiskMarketId: neg_risk_market_id,
      negRiskRequestId: neg_risk_request_id,
      notificationsEnabled: notifications_enabled,
      questionId: question_id,
      secondsDelay: seconds_delay,
      takerBaseFee: taker_base_fee,
    }),
  );

export type MarketNotificationPayload = z.infer<
  typeof MarketNotificationPayloadSchema
>;

/** Payload of a liquidity-reward payout notification. */
export const RewardPayoutNotificationPayloadSchema = z
  .object({
    proxyWallet: EvmAddressSchema,
    reward: DecimalishSchema,
    txnHash: TxHashSchema,
  })
  .transform(({ txnHash, ...rest }) => ({
    ...rest,
    transactionHash: txnHash,
  }));

export type RewardPayoutNotificationPayload = z.infer<
  typeof RewardPayoutNotificationPayloadSchema
>;

/** Payload of a yield payout notification. */
export const YieldPayoutNotificationPayloadSchema = z
  .object({
    amount: DecimalishSchema,
    proxyWallet: EvmAddressSchema,
    txnHash: TxHashSchema,
  })
  .transform(({ txnHash, ...rest }) => ({
    ...rest,
    transactionHash: txnHash,
  }));

export type YieldPayoutNotificationPayload = z.infer<
  typeof YieldPayoutNotificationPayloadSchema
>;

/**
 * Payload of a child-comment notification: the reply comment, its author's
 * profile, and the event or series the thread belongs to.
 */
export const ChildCommentNotificationPayloadSchema = z.object({
  body: z.string().nullish(),
  createdAt: IsoDateTimeStringSchema.nullish(),
  eventSlug: z.string().nullish(),
  eventTitle: z.string().nullish(),
  id: CommentIdSchema,
  image: z.string().nullish(),
  parentCommentID: CommentIdSchema.nullish(),
  parentEntityID: z.number().int().nullish(),
  parentEntityType: CommentParentEntityTypeSchema.nullish(),
  profile: CommentProfileSchema.nullish(),
  seriesSlug: z.string().nullish(),
  seriesTitle: z.string().nullish(),
  userAddress: z.string().nullish(),
});

export type ChildCommentNotificationPayload = z.infer<
  typeof ChildCommentNotificationPayloadSchema
>;

/**
 * Payload of an auto-redeem notification: a winning position redeemed
 * on-chain on the account's behalf.
 */
export const AutoRedeemedNotificationPayloadSchema = z
  .object({
    amount: DecimalishSchema,
    conditionId: ConditionIdSchema,
    image: z.string(),
    marketUrl: z.string().optional(),
    negRisk: z.boolean(),
    portfolioUrl: z.string().optional(),
    position: z.string().optional(),
    proxyWallet: EvmAddressSchema,
    question: z.string(),
    slug: z.string(),
    txnHash: TxHashSchema,
  })
  .transform(({ slug, txnHash, ...rest }) => ({
    ...rest,
    marketSlug: slug,
    transactionHash: txnHash,
  }));

export type AutoRedeemedNotificationPayload = z.infer<
  typeof AutoRedeemedNotificationPayloadSchema
>;

/**
 * Payload of a combo auto-redeem notification: a winning combo position
 * redeemed on-chain on the account's behalf. `legs` is the combo arity.
 */
export const ComboAutoRedeemedNotificationPayloadSchema = z
  .object({
    amount: DecimalishSchema,
    conditionId: ComboConditionIdSchema,
    legs: z.number().int(),
    outcomeIndex: z.number().int(),
    portfolioUrl: z.string().optional(),
    positionId: PositionIdSchema,
    proxyWallet: EvmAddressSchema,
    txnHash: TxHashSchema,
  })
  .transform(({ txnHash, ...rest }) => ({
    ...rest,
    transactionHash: txnHash,
  }));

export type ComboAutoRedeemedNotificationPayload = z.infer<
  typeof ComboAutoRedeemedNotificationPayloadSchema
>;

const NotificationTimestampSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  return /^\d+$/.test(value) ? Number(value) : Date.parse(value);
}, EpochMillisecondsSchema);

function createNotificationSchema<
  TType extends NotificationType,
  TPayload extends z.ZodType,
>(type: TType, payload: TPayload) {
  return z.object({
    id: NotificationIdSchema,
    owner: ApiKeySchema,
    payload,
    timestamp: NotificationTimestampSchema,
    type: z.literal(type),
  });
}

export const OrderCancellationNotificationSchema = createNotificationSchema(
  NotificationType.ORDER_CANCELLATION,
  OrderNotificationPayloadSchema,
);

export type OrderCancellationNotification = z.infer<
  typeof OrderCancellationNotificationSchema
>;

export const OrderFillNotificationSchema = createNotificationSchema(
  NotificationType.ORDER_FILL,
  OrderNotificationPayloadSchema,
);

export type OrderFillNotification = z.infer<typeof OrderFillNotificationSchema>;

export const MarketRegisteredNotificationSchema = createNotificationSchema(
  NotificationType.MARKET_REGISTERED,
  MarketNotificationPayloadSchema,
);

export type MarketRegisteredNotification = z.infer<
  typeof MarketRegisteredNotificationSchema
>;

export const MarketResolvedNotificationSchema = createNotificationSchema(
  NotificationType.MARKET_RESOLVED,
  MarketNotificationPayloadSchema,
);

export type MarketResolvedNotification = z.infer<
  typeof MarketResolvedNotificationSchema
>;

export const RewardPayoutNotificationSchema = createNotificationSchema(
  NotificationType.REWARD_PAYOUT,
  RewardPayoutNotificationPayloadSchema,
);

export type RewardPayoutNotification = z.infer<
  typeof RewardPayoutNotificationSchema
>;

export const ChildCommentCreatedNotificationSchema = createNotificationSchema(
  NotificationType.CHILD_COMMENT_CREATED,
  ChildCommentNotificationPayloadSchema,
);

export type ChildCommentCreatedNotification = z.infer<
  typeof ChildCommentCreatedNotificationSchema
>;

export const YieldPayoutNotificationSchema = createNotificationSchema(
  NotificationType.YIELD_PAYOUT,
  YieldPayoutNotificationPayloadSchema,
);

export type YieldPayoutNotification = z.infer<
  typeof YieldPayoutNotificationSchema
>;

export const OrderFillFailedNotificationSchema = createNotificationSchema(
  NotificationType.ORDER_FILL_FAILED,
  OrderNotificationPayloadSchema,
);

export type OrderFillFailedNotification = z.infer<
  typeof OrderFillFailedNotificationSchema
>;

export const AutoRedeemedNotificationSchema = createNotificationSchema(
  NotificationType.AUTO_REDEEMED,
  AutoRedeemedNotificationPayloadSchema,
);

export type AutoRedeemedNotification = z.infer<
  typeof AutoRedeemedNotificationSchema
>;

export const ComboAutoRedeemedNotificationSchema = createNotificationSchema(
  NotificationType.COMBO_AUTO_REDEEMED,
  ComboAutoRedeemedNotificationPayloadSchema,
);

export type ComboAutoRedeemedNotification = z.infer<
  typeof ComboAutoRedeemedNotificationSchema
>;

/**
 * Account notification. Discriminated on `type`: narrowing on it also
 * narrows `payload` to the shape carried by that notification kind.
 */
export const NotificationSchema = z.discriminatedUnion('type', [
  OrderCancellationNotificationSchema,
  OrderFillNotificationSchema,
  MarketRegisteredNotificationSchema,
  MarketResolvedNotificationSchema,
  RewardPayoutNotificationSchema,
  ChildCommentCreatedNotificationSchema,
  YieldPayoutNotificationSchema,
  OrderFillFailedNotificationSchema,
  AutoRedeemedNotificationSchema,
  ComboAutoRedeemedNotificationSchema,
]);

export type Notification = z.infer<typeof NotificationSchema>;

const NotificationTypeProbeSchema = z.object({
  type: z.number().int(),
});

/**
 * Notifications with types unknown to this SDK version are omitted so newly
 * introduced kinds cannot fail the feed; recognized types validate strictly.
 */
export const NotificationsResponseSchema = z
  .array(z.unknown())
  .transform((items, ctx) => {
    const notifications: Notification[] = [];
    items.forEach((item, index) => {
      const probe = NotificationTypeProbeSchema.safeParse(item);
      if (!probe.success) {
        for (const issue of probe.error.issues) {
          ctx.addIssue({ ...issue, path: [index, ...issue.path] });
        }
        return;
      }

      if (!NotificationTypeSchema.safeParse(probe.data.type).success) {
        return;
      }

      const notification = NotificationSchema.safeParse(item);
      if (notification.success) {
        notifications.push(notification.data);
        return;
      }

      for (const issue of notification.error.issues) {
        ctx.addIssue({ ...issue, path: [index, ...issue.path] });
      }
    });
    return notifications;
  });

export type NotificationsResponse = z.infer<typeof NotificationsResponseSchema>;
