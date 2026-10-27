import { describe, expect, it } from 'vitest';
import { PerpsPositionSnapshotsSchema } from './position-snapshots';

const snapshot = {
  position_cycle_id: 'opaque:cycle',
  side: 'long',
  started_at: 0,
  as_of_at: 1234,
  is_closed: true,
  size_after: '0',
  entry_price: '100.000000000000000001',
  as_of_price: '120',
  pnl: '20.000000000000000001',
  pnl_percent: null,
  leverage: null,
  chart: {
    candles: [{ position: 0.5, open: 100, high: 120, low: 99, close: 120 }],
    markers: [{ position: 1, kind: 'decrease' }],
  },
};

describe('position snapshots', () => {
  it('preserves exact values, u64 trade identities, all statuses, and order', () => {
    const statuses = [
      'not_found',
      'history_pending',
      'history_limit',
      'resource_limit',
      'temporarily_unavailable',
      'unavailable',
    ];
    const parsed = PerpsPositionSnapshotsSchema.parse({
      history_as_of_at: 1234,
      active: statuses.map((status, instrument_id) => ({
        status,
        instrument_id,
      })),
      history: [
        {
          instrument_id: 7,
          trade_id: '18446744073709551615',
          status: 'ok',
          snapshot,
        },
      ],
    });
    expect(parsed.active.map((item) => item.status)).toEqual(statuses);
    expect(parsed.history[0]).toMatchObject({
      tradeId: '18446744073709551615',
      snapshot: {
        pnl: '20.000000000000000001',
        entryPrice: '100.000000000000000001',
        leverage: null,
        pnlPercent: null,
        startedAt: 0,
      },
    });
  });

  it('rejects missing success payloads, failure payloads, and malformed identities', () => {
    const parse = (item: unknown) =>
      PerpsPositionSnapshotsSchema.safeParse({
        history_as_of_at: 1,
        active: [],
        history: [item],
      }).success;
    expect(parse({ instrument_id: 7, trade_id: '1', status: 'ok' })).toBe(
      false,
    );
    expect(
      parse({ instrument_id: 7, trade_id: '1', status: 'not_found', snapshot }),
    ).toBe(false);
    for (const trade_id of ['01', '18446744073709551616', 1, '-1']) {
      expect(
        parse({ instrument_id: 7, trade_id, status: 'ok', snapshot }),
      ).toBe(false);
    }
    expect(parse({ trade_id: '1', status: 'ok', snapshot })).toBe(false);
  });
});
