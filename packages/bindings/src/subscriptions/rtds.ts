import { z } from 'zod';
import {
  CommentMediaSchema,
  CommentProfileSchema,
  CommentSchema,
  ReactionSchema,
} from '../gamma/comment';
import {
  CommentParentEntityTypeSchema,
  DecimalishSchema,
  DecimalStringSchema,
  EpochMillisecondsSchema,
  toDecimalString,
} from '../shared';

const CommentRemovedPayloadSchema = z.object({
  id: z.string(),
  body: z.string().nullish(),
  parentEntityType: CommentParentEntityTypeSchema.nullish(),
  parentEntityID: z.number().int().nullish(),
  parentCommentID: z.string().nullish(),
  userAddress: z.string().nullish(),
  replyAddress: z.string().nullish(),
  createdAt: z.string().nullish(),
  updatedAt: z.string().nullish(),
  media: z.array(CommentMediaSchema).nullish(),
  profile: CommentProfileSchema.nullish(),
  reactions: z.array(ReactionSchema).nullish(),
  reportCount: z.number().int().nullish(),
  reactionCount: z.number().int().nullish(),
  tradeAsset: z.string().nullish(),
});

export type CommentRemovedPayload = z.infer<typeof CommentRemovedPayloadSchema>;

export const CommentCreatedEventSchema = z.object({
  topic: z.literal('comments'),
  type: z.literal('comment_created'),
  timestamp: EpochMillisecondsSchema,
  payload: CommentSchema,
});

export type CommentCreatedEvent = z.infer<typeof CommentCreatedEventSchema>;

export const CommentRemovedEventSchema = z.object({
  topic: z.literal('comments'),
  type: z.literal('comment_removed'),
  timestamp: EpochMillisecondsSchema,
  payload: CommentRemovedPayloadSchema,
});

export type CommentRemovedEvent = z.infer<typeof CommentRemovedEventSchema>;

export const ReactionCreatedEventSchema = z.object({
  topic: z.literal('comments'),
  type: z.literal('reaction_created'),
  timestamp: EpochMillisecondsSchema,
  payload: ReactionSchema,
});

export type ReactionCreatedEvent = z.infer<typeof ReactionCreatedEventSchema>;

export const ReactionRemovedEventSchema = z.object({
  topic: z.literal('comments'),
  type: z.literal('reaction_removed'),
  timestamp: EpochMillisecondsSchema,
  payload: ReactionSchema,
});

export type ReactionRemovedEvent = z.infer<typeof ReactionRemovedEventSchema>;

const PriceUpdatePayloadSchema = z.object({
  symbol: z.string(),
  timestamp: EpochMillisecondsSchema,
  value: DecimalishSchema,
});

export type PriceUpdatePayload = z.infer<typeof PriceUpdatePayloadSchema>;

const CRYPTO_PRICES_BINANCE_TOPIC = 'prices.crypto.binance' as const;
const CRYPTO_PRICES_CHAINLINK_TOPIC = 'prices.crypto.chainlink' as const;
const CRYPTO_PRICES_CHAINLINK_TWAP_TOPIC =
  'prices.crypto.chainlink.twap' as const;

export type CryptoPricesBinanceTopic = typeof CRYPTO_PRICES_BINANCE_TOPIC;
export type CryptoPricesChainlinkTopic = typeof CRYPTO_PRICES_CHAINLINK_TOPIC;
export type CryptoPricesChainlinkTwapTopic =
  typeof CRYPTO_PRICES_CHAINLINK_TWAP_TOPIC;
export type CryptoPricesChainlinkTwapWindowSeconds = 30 | 60;
export type CryptoPricesTopic =
  | CryptoPricesBinanceTopic
  | CryptoPricesChainlinkTopic;

const RawCryptoPricesBinanceTopicSchema = z.literal('crypto_prices');
const RawCryptoPricesChainlinkTopicSchema = z.literal(
  'crypto_prices_chainlink',
);
const RawCryptoPricesChainlinkTwapThirtyTopicSchema = z.literal(
  'crypto_prices_twap_thirty',
);
const RawCryptoPricesChainlinkTwapSixtyTopicSchema = z.literal(
  'crypto_prices_twap_sixty',
);

const CryptoPricesBinanceTopicSchema: z.ZodType<CryptoPricesBinanceTopic> =
  RawCryptoPricesBinanceTopicSchema.transform(() => {
    return CRYPTO_PRICES_BINANCE_TOPIC;
  });

const CryptoPricesChainlinkTopicSchema: z.ZodType<CryptoPricesChainlinkTopic> =
  RawCryptoPricesChainlinkTopicSchema.transform(() => {
    return CRYPTO_PRICES_CHAINLINK_TOPIC;
  });

const CryptoPricesChainlinkTwapThirtyTopicSchema =
  RawCryptoPricesChainlinkTwapThirtyTopicSchema.transform(() => {
    return CRYPTO_PRICES_CHAINLINK_TWAP_TOPIC;
  });

const CryptoPricesChainlinkTwapSixtyTopicSchema =
  RawCryptoPricesChainlinkTwapSixtyTopicSchema.transform(() => {
    return CRYPTO_PRICES_CHAINLINK_TWAP_TOPIC;
  });

export const CryptoPricesBinanceEventSchema = z.object({
  topic: CryptoPricesBinanceTopicSchema,
  type: z.literal('update'),
  timestamp: EpochMillisecondsSchema,
  payload: PriceUpdatePayloadSchema,
});

export type CryptoPricesBinanceEvent = z.infer<
  typeof CryptoPricesBinanceEventSchema
>;

export const CryptoPricesChainlinkEventSchema = z.object({
  topic: CryptoPricesChainlinkTopicSchema,
  type: z.literal('update'),
  timestamp: EpochMillisecondsSchema,
  payload: PriceUpdatePayloadSchema,
});

export type CryptoPricesChainlinkEvent = z.infer<
  typeof CryptoPricesChainlinkEventSchema
>;

const CHAINLINK_PRICE_SCALE = 1_000_000_000_000_000_000n;

function chainlinkE18PriceToDecimalString(value: string) {
  const scaledValue = BigInt(value);
  const isNegative = scaledValue < 0n;
  const absoluteValue = isNegative ? -scaledValue : scaledValue;
  const whole = absoluteValue / CHAINLINK_PRICE_SCALE;
  const fraction = (absoluteValue % CHAINLINK_PRICE_SCALE)
    .toString()
    .padStart(18, '0')
    .replace(/0+$/, '');

  return toDecimalString(
    `${isNegative ? '-' : ''}${whole}${fraction === '' ? '' : `.${fraction}`}`,
  );
}

// Chainlink publishes a float for display convenience and the exact
// BenchmarkPrice as a signed E18 integer. Normalize from the exact field.
const ChainlinkFullAccuracyPriceSchema = z
  .string()
  .regex(/^-?\d+$/)
  .transform(chainlinkE18PriceToDecimalString);

const CryptoPricesChainlinkTwapPayloadBaseSchema = z.object({
  symbol: z.string(),
  value: DecimalishSchema,
  full_accuracy_value: ChainlinkFullAccuracyPriceSchema,
  timestamp: EpochMillisecondsSchema,
});

function cryptoPricesChainlinkTwapPayloadSchema<
  const TWindowSeconds extends CryptoPricesChainlinkTwapWindowSeconds,
>(windowSeconds: TWindowSeconds) {
  return CryptoPricesChainlinkTwapPayloadBaseSchema.extend({
    window_s: z.literal(windowSeconds),
  }).transform((payload) => {
    return {
      symbol: payload.symbol,
      timestamp: payload.timestamp,
      value: payload.full_accuracy_value,
      windowSeconds: payload.window_s,
    };
  });
}

export const CryptoPricesChainlinkTwapThirtyEventSchema = z.object({
  topic: CryptoPricesChainlinkTwapThirtyTopicSchema,
  type: z.literal('update'),
  timestamp: EpochMillisecondsSchema,
  payload: cryptoPricesChainlinkTwapPayloadSchema(30),
});

export type CryptoPricesChainlinkTwapThirtyEvent = z.infer<
  typeof CryptoPricesChainlinkTwapThirtyEventSchema
>;

export const CryptoPricesChainlinkTwapSixtyEventSchema = z.object({
  topic: CryptoPricesChainlinkTwapSixtyTopicSchema,
  type: z.literal('update'),
  timestamp: EpochMillisecondsSchema,
  payload: cryptoPricesChainlinkTwapPayloadSchema(60),
});

export type CryptoPricesChainlinkTwapSixtyEvent = z.infer<
  typeof CryptoPricesChainlinkTwapSixtyEventSchema
>;

export const CryptoPricesChainlinkTwapEventSchema = z.union([
  CryptoPricesChainlinkTwapThirtyEventSchema,
  CryptoPricesChainlinkTwapSixtyEventSchema,
]);

export type CryptoPricesChainlinkTwapEvent = z.infer<
  typeof CryptoPricesChainlinkTwapEventSchema
>;

export const CryptoPricesEventSchema = z.discriminatedUnion('topic', [
  CryptoPricesBinanceEventSchema,
  CryptoPricesChainlinkEventSchema,
  CryptoPricesChainlinkTwapThirtyEventSchema,
  CryptoPricesChainlinkTwapSixtyEventSchema,
]);

export type CryptoPricesEvent = z.infer<typeof CryptoPricesEventSchema>;

const EquityPriceUpdatePayloadSchema = z
  .object({
    symbol: z.string(),
    value: DecimalishSchema,
    full_accuracy_value: DecimalStringSchema.nullish(),
    timestamp: EpochMillisecondsSchema,
    received_at: EpochMillisecondsSchema.nullish(),
    is_carried_forward: z.boolean().nullish(),
  })
  .transform(
    ({
      full_accuracy_value,
      received_at,
      is_carried_forward,
      value,
      ...rest
    }) => ({
      ...rest,
      value: full_accuracy_value ?? value,
      receivedAt: received_at,
      isCarriedForward: is_carried_forward,
    }),
  );

export type EquityPriceUpdatePayload = z.infer<
  typeof EquityPriceUpdatePayloadSchema
>;

const EquityPriceSnapshotPointSchema = z.object({
  timestamp: z.number(),
  value: DecimalishSchema,
});

export type EquityPriceSnapshotPoint = z.infer<
  typeof EquityPriceSnapshotPointSchema
>;

const EquityPriceSubscribePayloadSchema = z.object({
  symbol: z.string(),
  data: z.array(EquityPriceSnapshotPointSchema),
});

export type EquityPriceSubscribePayload = z.infer<
  typeof EquityPriceSubscribePayloadSchema
>;

const RawEquityPricesTopicSchema = z.literal('equity_prices');

const EQUITY_PRICES_TOPIC = 'prices.equity.pyth' as const;

export type EquityPricesTopic = typeof EQUITY_PRICES_TOPIC;

const EquityPricesTopicSchema: z.ZodType<EquityPricesTopic> =
  RawEquityPricesTopicSchema.transform(() => {
    return EQUITY_PRICES_TOPIC;
  });

export const EquityPricesUpdateEventSchema = z.object({
  topic: EquityPricesTopicSchema,
  type: z.literal('update'),
  timestamp: EpochMillisecondsSchema,
  payload: EquityPriceUpdatePayloadSchema,
});

export type EquityPricesUpdateEvent = z.infer<
  typeof EquityPricesUpdateEventSchema
>;

export const EquityPricesSubscribeEventSchema = z.object({
  topic: EquityPricesTopicSchema,
  type: z.literal('subscribe'),
  timestamp: EpochMillisecondsSchema,
  payload: EquityPriceSubscribePayloadSchema,
});

export type EquityPricesSubscribeEvent = z.infer<
  typeof EquityPricesSubscribeEventSchema
>;

export const EquityPricesEventSchema = z.discriminatedUnion('type', [
  EquityPricesUpdateEventSchema,
  EquityPricesSubscribeEventSchema,
]);

export type EquityPricesEvent = z.infer<typeof EquityPricesEventSchema>;

export const CommentsEventSchema = z.discriminatedUnion('type', [
  CommentCreatedEventSchema,
  CommentRemovedEventSchema,
  ReactionCreatedEventSchema,
  ReactionRemovedEventSchema,
]);

export type CommentsEvent = z.infer<typeof CommentsEventSchema>;

export const RealtimeEventSchema = z.discriminatedUnion('topic', [
  CommentsEventSchema,
  CryptoPricesEventSchema,
  EquityPricesEventSchema,
]);

export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;
