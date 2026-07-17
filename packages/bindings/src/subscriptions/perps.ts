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

export type PerpsTradeEvent = z.infer<typeof PerpsTradeEventSchema>;

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

export type PerpsBboEvent = z.infer<typeof PerpsBboEventSchema>;

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

export type PerpsBookEvent = z.infer<typeof PerpsBookEventSchema>;

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

export type PerpsTickerEvent = z.infer<typeof PerpsTickerEventSchema>;

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

export type PerpsStatisticEvent = z.infer<typeof PerpsStatisticEventSchema>;

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

export type PerpsCandleEvent = z.infer<typeof PerpsCandleEventSchema>;

export const PerpsMarketDataEventSchema = z.union([
  PerpsTradeEventSchema,
  PerpsBboEventSchema,
  PerpsBookEventSchema,
  PerpsTickerEventSchema,
  PerpsStatisticEventSchema,
  PerpsCandleEventSchema,
]);

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

export const PerpsBalanceUpdateEventSchema = perpsSessionEventSchema(
  'balance',
  'balances',
  PerpsBalanceSchema,
);
export type PerpsBalanceUpdateEvent = z.infer<
  typeof PerpsBalanceUpdateEventSchema
>;

export const PerpsPortfolioUpdateEventSchema = perpsSessionEventSchema(
  'portfolio',
  'portfolio',
  PerpsPortfolioSchema,
);
export type PerpsPortfolioUpdateEvent = z.infer<
  typeof PerpsPortfolioUpdateEventSchema
>;

export const PerpsOrderUpdateEventSchema = perpsSessionEventSchema(
  'order',
  'orders',
  PerpsOrderUpdateSchema,
);
export type PerpsOrderUpdateEvent = z.infer<typeof PerpsOrderUpdateEventSchema>;

export const PerpsFillUpdateEventSchema = perpsSessionEventSchema(
  'fill',
  'fills',
  z.array(PerpsAccountFillUpdateSchema),
);
export type PerpsFillUpdateEvent = z.infer<typeof PerpsFillUpdateEventSchema>;

export const PerpsFundingUpdateEventSchema = perpsSessionEventSchema(
  'funding',
  'funding',
  PerpsAccountFundingPaymentEntrySchema,
);
export type PerpsFundingUpdateEvent = z.infer<
  typeof PerpsFundingUpdateEventSchema
>;

export const PerpsDepositUpdateEventSchema = perpsSessionEventSchema(
  'deposit',
  'deposits',
  PerpsDepositUpdateSchema,
);
export type PerpsDepositUpdateEvent = z.infer<
  typeof PerpsDepositUpdateEventSchema
>;

export const PerpsWithdrawalUpdateEventSchema = perpsSessionEventSchema(
  'withdrawal',
  'withdrawals',
  PerpsWithdrawalUpdateSchema,
);
export type PerpsWithdrawalUpdateEvent = z.infer<
  typeof PerpsWithdrawalUpdateEventSchema
>;

export const PerpsNotificationUpdateEventSchema = perpsSessionEventSchema(
  'notification',
  'notifications',
  PerpsNotificationSchema,
);
export type PerpsNotificationUpdateEvent = z.infer<
  typeof PerpsNotificationUpdateEventSchema
>;

/**
 * Backpressure control frame on the `notifications` channel. The server sends
 * it when one or more notification data frames were dropped; `sq` is the
 * highest engine sequence among the dropped notifications.
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
    reason: 'server' as const,
    channel: ch,
    timestamp: ts,
    sequence: sq,
  }));

const PerpsTpSlLifecycleUpdateSchema = z.object({
  oid: PerpsOrderIdSchema,
  st: z.enum(['untriggered', 'armed', 'cancelled', 'expired']),
  reason: z.string().optional(),
});

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
export type PerpsTpSlUpdateEvent = z.infer<typeof PerpsTpSlUpdateEventSchema>;

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

export type PerpsSessionUpdateEvent = z.infer<
  typeof PerpsSessionUpdateEventSchema
>;

/**
 * Signals that channel events may have been missed and channel state should
 * be re-read. `reconnect` and `sequence_gap` resyncs are synthesized locally;
 * `server` resyncs relay a server-sent `notifications` backpressure frame
 * whose `sequence` is the highest engine sequence among the dropped
 * notifications.
 */
export type PerpsResyncEvent = {
  type: 'resync';
  reason: 'reconnect' | 'sequence_gap' | 'server';
  channel?: string;
  previousSequence?: number;
  sequence?: number;
  timestamp?: number;
};

export type PerpsSessionEvent = PerpsSessionUpdateEvent | PerpsResyncEvent;

function instrumentIdFromChannel(channel: string) {
  const [, rawInstrumentId] = channel.split('::');
  return PerpsInstrumentIdSchema.parse(Number(rawInstrumentId));
}

function candleIntervalFromChannel(channel: string) {
  const [, , interval] = channel.split('::');
  return interval as Exclude<PerpsKlineInterval, PerpsKlineInterval.OneSecond>;
}
