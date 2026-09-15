import { z } from 'zod';
import {
  DecimalishSchema,
  DecimalStringSchema,
  EpochMillisecondsSchema,
} from '../shared';

export enum RealtimeErrorCode {
  BadOp = 'bad_op',
  BadChannel = 'bad_channel',
  BadFilter = 'bad_filter',
  SubscriptionLimit = 'sub_limit',
  RateLimited = 'rate_limited',
  AuthRequired = 'auth_required',
  AuthUnavailable = 'auth_unavailable',
  AuthExpired = 'auth_expired',
  AuthAttempts = 'auth_attempts',
  AuthInvalid = 'auth_invalid',
}

export enum PolyboltChannel {
  Crypto = 'price.crypto',
  Twap = 'price.crypto.twap',
  Equity = 'price.equity',
}

/** A filter sent to a PolyBolt price channel. */
export type PolyboltFilter =
  | { symbol: string; window_seconds?: 60 }
  | { asset_id: string };

/** One item in a PolyBolt subscription operation. */
export type PolyboltSubscription = {
  channel: PolyboltChannel;
  filter: PolyboltFilter;
};

export enum PolyboltAckOp {
  Subscribed = 'subscribed',
  Unsubscribed = 'unsubscribed',
  Pong = 'pong',
  Authed = 'authed',
  Error = 'error',
}

export const PolyboltAckSchema = z.object({
  op: z.enum(PolyboltAckOp),
  channel: z.string().optional(),
  rid: z.string().optional(),
  code: z.enum(RealtimeErrorCode).optional(),
});
export type PolyboltAck = z.infer<typeof PolyboltAckSchema>;

export const PolyboltEnvelopeSchema = z.object({
  v: z.literal(1),
  channel: z.enum(PolyboltChannel),
  seq: z.number().int().nonnegative(),
  ts: EpochMillisecondsSchema,
  snapshot: z.boolean().optional(),
  dropped: z.number().int().nonnegative().optional(),
  payload: z.unknown(),
});
export type PolyboltEnvelope = z.infer<typeof PolyboltEnvelopeSchema>;

const PricePointSchema = z
  .object({
    timestamp: EpochMillisecondsSchema,
    value: DecimalishSchema,
    full_accuracy_value: DecimalStringSchema,
  })
  .transform(({ timestamp, full_accuracy_value }) => ({
    timestamp,
    value: full_accuracy_value,
  }));

const PricePayloadSchema = z
  .object({
    symbol: z.string(),
    timestamp: EpochMillisecondsSchema,
    value: DecimalishSchema,
    full_accuracy_value: DecimalStringSchema,
    received_at: EpochMillisecondsSchema.optional(),
    is_carried_forward: z.boolean().optional(),
  })
  .transform(
    ({
      symbol,
      timestamp,
      full_accuracy_value,
      received_at,
      is_carried_forward,
    }) => ({
      symbol,
      timestamp,
      value: full_accuracy_value,
      receivedAt: received_at,
      isCarriedForward: is_carried_forward,
    }),
  );

const SnapshotPayloadSchema = z.object({
  symbol: z.string(),
  data: z.array(PricePointSchema),
});
const TwapWindowSchema = z.literal(60);
const TwapPayloadSchema = z
  .object({
    symbol: z.string(),
    timestamp: EpochMillisecondsSchema,
    value: DecimalishSchema,
    full_accuracy_value: DecimalStringSchema,
    window_seconds: TwapWindowSchema,
  })
  .transform(({ symbol, timestamp, full_accuracy_value, window_seconds }) => ({
    symbol,
    timestamp,
    value: full_accuracy_value,
    windowSeconds: window_seconds,
  }));
const TwapSnapshotSchema = SnapshotPayloadSchema.extend({
  window_seconds: TwapWindowSchema,
}).transform(({ symbol, data, window_seconds }) => ({
  symbol,
  data,
  windowSeconds: window_seconds,
}));
const EventMetadataSchema = z.object({
  timestamp: EpochMillisecondsSchema,
  seq: z.number().optional(),
  dropped: z.number().optional(),
});
export const CryptoPriceEventSchema = z.union([
  EventMetadataSchema.extend({
    topic: z.literal('prices.crypto'),
    type: z.literal('update'),
    payload: PricePayloadSchema,
  }),
  EventMetadataSchema.extend({
    topic: z.literal('prices.crypto'),
    type: z.literal('subscribe'),
    payload: SnapshotPayloadSchema,
  }),
]);
/**
 * A cryptocurrency price event.
 *
 * `seq` is scoped to one channel on one WebSocket connection and resets after
 * reconnecting. When an SDK subscription spans multiple connections, sequence
 * values from those connections may interleave.
 */
export type CryptoPriceEvent = z.infer<typeof CryptoPriceEventSchema>;
export type CryptoPriceSnapshotEvent = Extract<
  CryptoPriceEvent,
  { type: 'subscribe' }
>;
export const CryptoTwapPriceEventSchema = z.union([
  EventMetadataSchema.extend({
    topic: z.literal('prices.crypto.twap'),
    type: z.literal('update'),
    payload: TwapPayloadSchema,
  }),
  EventMetadataSchema.extend({
    topic: z.literal('prices.crypto.twap'),
    type: z.literal('subscribe'),
    payload: TwapSnapshotSchema,
  }),
]);
/**
 * A cryptocurrency TWAP event.
 *
 * `seq` is scoped to one channel on one WebSocket connection and resets after
 * reconnecting. When an SDK subscription spans multiple connections, sequence
 * values from those connections may interleave.
 */
export type CryptoTwapPriceEvent = z.infer<typeof CryptoTwapPriceEventSchema>;
export type CryptoTwapPriceSnapshotEvent = Extract<
  CryptoTwapPriceEvent,
  { type: 'subscribe' }
>;
export const EquityPriceEventSchema = z.union([
  EventMetadataSchema.extend({
    topic: z.literal('prices.equity'),
    type: z.literal('update'),
    payload: PricePayloadSchema,
  }),
  EventMetadataSchema.extend({
    topic: z.literal('prices.equity'),
    type: z.literal('subscribe'),
    payload: SnapshotPayloadSchema,
  }),
]);
/**
 * An equity price event.
 *
 * `seq` is scoped to one channel on one WebSocket connection and resets after
 * reconnecting. When an SDK subscription spans multiple connections, sequence
 * values from those connections may interleave.
 */
export type EquityPriceEvent = z.infer<typeof EquityPriceEventSchema>;
export type PriceEvent =
  | CryptoPriceEvent
  | CryptoTwapPriceEvent
  | EquityPriceEvent;

/** @internal Normalizes validated envelopes, dropping unknown payloads. */
export function parsePolyboltEvent(
  envelope: PolyboltEnvelope,
): PriceEvent | undefined {
  const event = {
    timestamp: envelope.ts,
    seq: envelope.seq,
    dropped: envelope.dropped,
    type: envelope.snapshot ? 'subscribe' : 'update',
    payload: envelope.payload,
  };
  switch (envelope.channel) {
    case PolyboltChannel.Crypto:
      return CryptoPriceEventSchema.safeParse({
        ...event,
        topic: 'prices.crypto',
      }).data;
    case PolyboltChannel.Twap:
      return CryptoTwapPriceEventSchema.safeParse({
        ...event,
        topic: 'prices.crypto.twap',
      }).data;
    case PolyboltChannel.Equity:
      return EquityPriceEventSchema.safeParse({
        ...event,
        topic: 'prices.equity',
      }).data;
  }
}
