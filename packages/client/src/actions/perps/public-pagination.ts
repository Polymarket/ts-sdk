import {
  PerpsInstrumentIdSchema,
  type PerpsKlineInterval,
  PerpsKlineIntervalSchema,
  type PerpsTradeId,
  PerpsTradeIdSchema,
} from '@polymarket/bindings/perps';
import { invariant } from '@polymarket/types';
import { z } from 'zod';
import { encodeCursorState } from '../../pagination';

const TimestampInputSchema = z.number().int().nonnegative();
type Timestamped = { timestamp: number };
type TimestampedTrade = Timestamped & { tradeId: PerpsTradeId };

export const PerpsCandlesCursorStateSchema = z.object({
  kind: z.literal('perpsCandles'),
  instrumentId: PerpsInstrumentIdSchema,
  interval: PerpsKlineIntervalSchema,
  startTimestamp: TimestampInputSchema,
  endTimestamp: TimestampInputSchema,
});

export const PerpsFundingCursorStateSchema = z.object({
  kind: z.literal('perpsFundingHistory'),
  instrumentId: PerpsInstrumentIdSchema,
  startTimestamp: TimestampInputSchema,
  endTimestamp: TimestampInputSchema,
});

export const PerpsTradesCursorStateSchema = z.object({
  kind: z.literal('perpsTrades'),
  instrumentId: PerpsInstrumentIdSchema,
  startTimestamp: TimestampInputSchema,
  endTimestamp: TimestampInputSchema,
  seenTradeIds: z.array(PerpsTradeIdSchema),
});

export type PerpsCandlesCursorState = z.infer<
  typeof PerpsCandlesCursorStateSchema
>;
export type PerpsFundingCursorState = z.infer<
  typeof PerpsFundingCursorStateSchema
>;
export type PerpsTradesCursorState = z.infer<
  typeof PerpsTradesCursorStateSchema
>;

export function toPerpsCandlesPage<T extends Timestamped>(
  state: PerpsCandlesCursorState,
  response: { data: T[]; more: boolean },
) {
  const last = response.data.at(-1);
  const hasMore = response.more && last !== undefined;

  return {
    items: response.data,
    hasMore,
    nextCursor: hasMore
      ? encodeCursorState({
          ...state,
          startTimestamp:
            last.timestamp + perpsKlineIntervalMilliseconds(state.interval),
        })
      : undefined,
  };
}

export function toPerpsFundingPage<T extends Timestamped>(
  state: PerpsFundingCursorState,
  response: { data: T[]; more: boolean },
) {
  const last = response.data.at(-1);
  const hasMore =
    response.more &&
    last !== undefined &&
    last.timestamp > state.startTimestamp;

  return {
    items: response.data,
    hasMore,
    nextCursor: hasMore
      ? encodeCursorState({
          ...state,
          endTimestamp: last.timestamp - 1,
        })
      : undefined,
  };
}

export function toPerpsTradesPage<T extends TimestampedTrade>(
  state: PerpsTradesCursorState,
  response: { data: T[]; more: boolean },
) {
  const seenTradeIds = new Set(state.seenTradeIds);
  const items = response.data.filter(
    (trade) => !seenTradeIds.has(trade.tradeId),
  );
  const rawLast = response.data.at(-1);
  const last = items.at(-1);
  const cursorTimestamp = last?.timestamp ?? rawLast?.timestamp;
  const hasMore =
    response.more &&
    cursorTimestamp !== undefined &&
    cursorTimestamp > state.startTimestamp;

  return {
    items,
    hasMore,
    nextCursor: hasMore
      ? encodeCursorState({
          ...state,
          endTimestamp:
            last === undefined ? cursorTimestamp - 1 : cursorTimestamp,
          seenTradeIds:
            last === undefined
              ? []
              : nextPerpsTradeCursorSeenIds(state, items, last),
        })
      : undefined,
  };
}

function perpsKlineIntervalMilliseconds(interval: PerpsKlineInterval): number {
  switch (interval) {
    case '1s':
      return 1000;
    case '1m':
      return 60 * 1000;
    case '5m':
      return 5 * 60 * 1000;
    case '15m':
      return 15 * 60 * 1000;
    case '1h':
      return 60 * 60 * 1000;
    case '4h':
      return 4 * 60 * 60 * 1000;
    case '1d':
      return 24 * 60 * 60 * 1000;
    case '1w':
      return 7 * 24 * 60 * 60 * 1000;
  }
  invariant(false, `Unsupported Perps kline interval: ${String(interval)}`);
}

function nextPerpsTradeCursorSeenIds(
  state: PerpsTradesCursorState,
  items: readonly TimestampedTrade[],
  last: TimestampedTrade,
) {
  const seen = new Set(
    state.endTimestamp === last.timestamp ? state.seenTradeIds : [],
  );
  for (const item of items) {
    if (item.timestamp === last.timestamp) seen.add(item.tradeId);
  }
  return Array.from(seen);
}
