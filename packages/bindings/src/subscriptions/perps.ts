import { z } from 'zod';
import {
  PerpsAccountFundingPaymentEntrySchema,
  PerpsBalanceSchema,
  PerpsPortfolioSchema,
} from '../perps/account';
import {
  PerpsInstrumentIdSchema,
  type PerpsKlineInterval,
  PerpsOrderIdSchema,
} from '../perps/common';
import {
  PerpsDepositUpdateSchema,
  PerpsWithdrawalUpdateSchema,
} from '../perps/funds';
import {
  PerpsBboUpdateSchema,
  PerpsBookUpdateSchema,
  PerpsCandleSchema,
  PerpsPublicTradeUpdateSchema,
  PerpsStatisticUpdateSchema,
  PerpsTickerEntrySchema,
} from '../perps/market';
import { PerpsNotificationSchema } from '../perps/notifications';
import {
  PerpsAccountFillUpdateSchema,
  PerpsOrderUpdateSchema,
} from '../perps/orders';
import { EpochMillisecondsSchema } from '../shared';

const SequenceSchema = z.number().int().nonnegative();

const TradesChannelSchema = z.string().regex(/^trades::\d+$/);
const BboChannelSchema = z.string().regex(/^bbo::\d+$/);
const BookChannelSchema = z.string().regex(/^book::\d+$/);
const TickersChannelSchema = z.string().regex(/^tickers::(all|\d+)$/);
const StatisticsChannelSchema = z.string().regex(/^statistics::(all|\d+)$/);
const CandlesChannelSchema = z
  .string()
  .regex(/^klines::\d+::(1m|5m|15m|1h|4h|1d|1w)$/);
const TpslChannelSchema = z.string().regex(/^tpsl::\d+$/);
const PerpsSessionChannelSchema = z.enum([
  'balances',
  'portfolio',
  'orders',
  'fills',
  'funding',
  'deposits',
  'withdrawals',
  'notifications',
]);

const PerpsUpdateEnvelopeSchema = z.object({
  ts: EpochMillisecondsSchema,
  sq: SequenceSchema,
});

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsTradeEventSchema = PerpsUpdateEnvelopeSchema.extend({
  ch: TradesChannelSchema,
  data: z.array(PerpsPublicTradeUpdateSchema),
}).transform(({ ch, ts, sq, data }) => ({
  topic: 'perps.trades' as const,
  type: 'trade' as const,
  channel: ch,
  timestamp: ts,
  sequence: sq,
  payload: data,
}));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsTradeEvent = z.infer<typeof PerpsTradeEventSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsBboEventSchema = PerpsUpdateEnvelopeSchema.extend({
  ch: BboChannelSchema,
  data: PerpsBboUpdateSchema,
}).transform(({ ch, ts, sq, data }) => ({
  topic: 'perps.bbo' as const,
  type: 'bbo' as const,
  channel: ch,
  timestamp: ts,
  sequence: sq,
  payload: data,
}));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsBboEvent = z.infer<typeof PerpsBboEventSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsBookEventSchema = PerpsUpdateEnvelopeSchema.extend({
  ch: BookChannelSchema,
  data: PerpsBookUpdateSchema,
}).transform(({ ch, ts, sq, data }) => ({
  topic: 'perps.book' as const,
  type: 'book' as const,
  channel: ch,
  timestamp: ts,
  sequence: sq,
  payload: {
    instrumentId: instrumentIdFromChannel(ch),
    ...data,
  },
}));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsBookEvent = z.infer<typeof PerpsBookEventSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsTickerEventSchema = PerpsUpdateEnvelopeSchema.extend({
  ch: TickersChannelSchema,
  data: PerpsTickerEntrySchema,
}).transform(({ ch, ts, sq, data }) => ({
  topic: 'perps.tickers' as const,
  type: 'ticker' as const,
  channel: ch,
  timestamp: ts,
  sequence: sq,
  payload: data,
}));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsTickerEvent = z.infer<typeof PerpsTickerEventSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsStatisticEventSchema = PerpsUpdateEnvelopeSchema.extend({
  ch: StatisticsChannelSchema,
  data: PerpsStatisticUpdateSchema,
}).transform(({ ch, ts, sq, data }) => ({
  topic: 'perps.statistics' as const,
  type: 'statistic' as const,
  channel: ch,
  timestamp: ts,
  sequence: sq,
  payload: data,
}));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsStatisticEvent = z.infer<typeof PerpsStatisticEventSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsCandleEventSchema = PerpsUpdateEnvelopeSchema.extend({
  ch: CandlesChannelSchema,
  data: z.array(PerpsCandleSchema),
}).transform(({ ch, ts, sq, data }) => ({
  topic: 'perps.candles' as const,
  type: 'candle' as const,
  channel: ch,
  timestamp: ts,
  sequence: sq,
  payload: {
    instrumentId: instrumentIdFromChannel(ch),
    interval: candleIntervalFromChannel(ch),
    candles: data,
  },
}));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsCandleEvent = z.infer<typeof PerpsCandleEventSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsMarketDataEventSchema = z.union([
  PerpsTradeEventSchema,
  PerpsBboEventSchema,
  PerpsBookEventSchema,
  PerpsTickerEventSchema,
  PerpsStatisticEventSchema,
  PerpsCandleEventSchema,
]);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsMarketDataEvent = z.infer<typeof PerpsMarketDataEventSchema>;

const PerpsSessionUpdateEnvelopeSchema = PerpsUpdateEnvelopeSchema.extend({
  ch: PerpsSessionChannelSchema,
});

function perpsSessionEventSchema<
  TType extends string,
  TChannel extends z.infer<typeof PerpsSessionChannelSchema>,
  TPayload extends z.ZodType,
>(type: TType, channel: TChannel, payload: TPayload) {
  return PerpsSessionUpdateEnvelopeSchema.extend({
    ch: z.literal(channel),
    data: payload,
  }).transform((message) => {
    const event = message as {
      ch: TChannel;
      data: z.output<TPayload>;
      sq: number;
      ts: number;
    };

    return {
      type,
      channel: event.ch,
      timestamp: event.ts,
      sequence: event.sq,
      payload: event.data,
    };
  });
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsBalanceUpdateEventSchema = perpsSessionEventSchema(
  'balance',
  'balances',
  PerpsBalanceSchema,
);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsBalanceUpdateEvent = z.infer<
  typeof PerpsBalanceUpdateEventSchema
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsPortfolioUpdateEventSchema = perpsSessionEventSchema(
  'portfolio',
  'portfolio',
  PerpsPortfolioSchema,
);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPortfolioUpdateEvent = z.infer<
  typeof PerpsPortfolioUpdateEventSchema
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsOrderUpdateEventSchema = perpsSessionEventSchema(
  'order',
  'orders',
  PerpsOrderUpdateSchema,
);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsOrderUpdateEvent = z.infer<typeof PerpsOrderUpdateEventSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsFillUpdateEventSchema = perpsSessionEventSchema(
  'fill',
  'fills',
  z.array(PerpsAccountFillUpdateSchema),
);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsFillUpdateEvent = z.infer<typeof PerpsFillUpdateEventSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsFundingUpdateEventSchema = perpsSessionEventSchema(
  'funding',
  'funding',
  PerpsAccountFundingPaymentEntrySchema,
);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsFundingUpdateEvent = z.infer<
  typeof PerpsFundingUpdateEventSchema
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsDepositUpdateEventSchema = perpsSessionEventSchema(
  'deposit',
  'deposits',
  PerpsDepositUpdateSchema,
);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsDepositUpdateEvent = z.infer<
  typeof PerpsDepositUpdateEventSchema
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsWithdrawalUpdateEventSchema = perpsSessionEventSchema(
  'withdrawal',
  'withdrawals',
  PerpsWithdrawalUpdateSchema,
);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsWithdrawalUpdateEvent = z.infer<
  typeof PerpsWithdrawalUpdateEventSchema
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsNotificationUpdateEventSchema = perpsSessionEventSchema(
  'notification',
  'notifications',
  PerpsNotificationSchema,
);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsNotificationUpdateEvent = z.infer<
  typeof PerpsNotificationUpdateEventSchema
>;

/**
 * Backpressure control frame on the `notifications` channel. The server sends
 * it when one or more notification data frames were dropped; `sq` is the
 * highest engine sequence among the dropped notifications.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsNotificationsResyncFrameSchema = z
  .object({
    ch: z.literal('notifications'),
    ts: EpochMillisecondsSchema,
    sq: SequenceSchema,
    type: z.literal('resync'),
  })
  .transform(({ ch, ts, sq }) => ({
    type: 'resync' as const,
    channel: ch,
    timestamp: ts,
    sequence: sq,
  }));

const PerpsTpSlLifecycleUpdateSchema = z.object({
  oid: PerpsOrderIdSchema,
  st: z.enum(['untriggered', 'armed', 'cancelled', 'expired']),
  reason: z.string().optional(),
});

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsTpSlUpdateEventSchema = PerpsUpdateEnvelopeSchema.extend({
  ch: TpslChannelSchema,
  data: PerpsTpSlLifecycleUpdateSchema.transform((update) => ({
    orderId: update.oid,
    status: update.st,
    reason: update.reason,
  })),
}).transform(({ ch, ts, sq, data }) => ({
  type: 'tpsl' as const,
  channel: ch,
  timestamp: ts,
  sequence: sq,
  payload: data,
}));
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsTpSlUpdateEvent = z.infer<typeof PerpsTpSlUpdateEventSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsSessionUpdateEventSchema = z.union([
  PerpsBalanceUpdateEventSchema,
  PerpsPortfolioUpdateEventSchema,
  PerpsOrderUpdateEventSchema,
  PerpsFillUpdateEventSchema,
  PerpsFundingUpdateEventSchema,
  PerpsDepositUpdateEventSchema,
  PerpsWithdrawalUpdateEventSchema,
  PerpsNotificationUpdateEventSchema,
  PerpsTpSlUpdateEventSchema,
]);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsSessionUpdateEvent = z.infer<
  typeof PerpsSessionUpdateEventSchema
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsResyncEvent = {
  type: 'resync';
  reason: 'reconnect' | 'sequence_gap';
  channel?: string;
  previousSequence?: number;
  sequence?: number;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsSessionEvent = PerpsSessionUpdateEvent | PerpsResyncEvent;

function instrumentIdFromChannel(channel: string) {
  const [, rawInstrumentId] = channel.split('::');
  return PerpsInstrumentIdSchema.parse(Number(rawInstrumentId));
}

function candleIntervalFromChannel(channel: string) {
  const [, , interval] = channel.split('::');
  return interval as Exclude<PerpsKlineInterval, PerpsKlineInterval.OneSecond>;
}
