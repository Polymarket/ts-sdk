import {
  PerpsInstrumentIdSchema,
  PerpsKlineInterval,
  PerpsTradeIdSchema,
} from '@polymarket/bindings/perps';
import { expectPresent } from '@polymarket/types';
import { describe, expect, it } from 'vitest';
import { decodeCursorState } from '../../pagination';
import {
  PerpsCandlesCursorStateSchema,
  PerpsFundingCursorStateSchema,
  PerpsTradesCursorStateSchema,
  toPerpsCandlesPage,
  toPerpsFundingPage,
  toPerpsTradesPage,
} from './public-pagination';

const instrumentId = PerpsInstrumentIdSchema.parse(1);
const range = { instrumentId, startTimestamp: 0, endTimestamp: 3000 };
function trade(id: number, timestamp: number) {
  return { tradeId: PerpsTradeIdSchema.parse(id), timestamp };
}

describe('Perps public pagination transitions', () => {
  it('continues candle pages at the next interval and keeps the original end', () => {
    const page = toPerpsCandlesPage(
      {
        ...range,
        kind: 'perpsCandles',
        interval: PerpsKlineInterval.OneMinute,
        endTimestamp: 300_000,
      },
      { data: [{ timestamp: 1000 }, { timestamp: 61_000 }], more: true },
    );
    const next = decodeCursorState(
      expectPresent(page.nextCursor),
      PerpsCandlesCursorStateSchema,
      'Invalid test cursor',
    );
    expect(page.items.map((item) => item.timestamp)).toEqual([1000, 61_000]);
    expect(next).toMatchObject({
      startTimestamp: 121_000,
      endTimestamp: 300_000,
    });
    expect(
      toPerpsCandlesPage(next, { data: [{ timestamp: 121_000 }], more: false })
        .hasMore,
    ).toBe(false);
  });

  it('continues funding pages before the last returned timestamp', () => {
    const page = toPerpsFundingPage(
      { ...range, kind: 'perpsFundingHistory' },
      { data: [{ timestamp: 3000 }, { timestamp: 2000 }], more: true },
    );
    expect(
      decodeCursorState(
        expectPresent(page.nextCursor),
        PerpsFundingCursorStateSchema,
        'Invalid test cursor',
      ),
    ).toMatchObject({ endTimestamp: 1999, startTimestamp: 0 });
  });

  it('overlaps trade pages and removes trades already seen at the boundary', () => {
    const page = toPerpsTradesPage(
      { ...range, kind: 'perpsTrades', seenTradeIds: [] },
      { data: [trade(1, 3000), trade(2, 2000)], more: true },
    );
    const next = decodeCursorState(
      expectPresent(page.nextCursor),
      PerpsTradesCursorStateSchema,
      'Invalid test cursor',
    );
    expect(next).toMatchObject({ endTimestamp: 2000, seenTradeIds: [2] });
    const second = toPerpsTradesPage(next, {
      data: [trade(2, 2000), trade(3, 2000), trade(4, 1000)],
      more: false,
    });
    expect(second.items.map((item) => item.tradeId)).toEqual([3, 4]);
    expect(second.hasMore).toBe(false);
  });

  it('advances past a fully deduped boundary page without ending pagination', () => {
    const page = toPerpsTradesPage(
      { ...range, kind: 'perpsTrades', seenTradeIds: [] },
      { data: [trade(1, 3000), trade(2, 2000)], more: true },
    );
    const next = decodeCursorState(
      expectPresent(page.nextCursor),
      PerpsTradesCursorStateSchema,
      'Invalid test cursor',
    );
    const boundary = toPerpsTradesPage(next, {
      data: [trade(2, 2000)],
      more: true,
    });
    expect(boundary.items).toEqual([]);
    expect(boundary.hasMore).toBe(true);
    const afterBoundary = decodeCursorState(
      expectPresent(boundary.nextCursor),
      PerpsTradesCursorStateSchema,
      'Invalid test cursor',
    );
    expect(afterBoundary).toMatchObject({
      endTimestamp: 1999,
      seenTradeIds: [],
    });
    expect(
      toPerpsTradesPage(afterBoundary, {
        data: [trade(3, 1000)],
        more: false,
      }).items.map((item) => item.tradeId),
    ).toEqual([3]);
  });
});
