import { describe, expect, it } from 'vitest';
import {
  PolyboltAckSchema,
  PolyboltEnvelopeSchema,
  parsePolyboltEvent,
} from './polybolt';

// Representative frames captured from the staging edge on 2026-09-08; history
// is reduced to two points. Auth was captured in shadow mode, not enforcement.
// The unknown-code and precision/drop cases below are synthetic.
describe('realtime frame normalization', () => {
  it.each([
    {
      op: 'error',
      code: 'bad_op',
    },
    {
      op: 'pong',
      rid: 'ping',
    },
    {
      op: 'subscribed',
      channel: 'price.crypto',
      rid: 'capture',
    },
    {
      op: 'subscribed',
      channel: 'price.crypto.twap',
      rid: 'capture',
    },
    {
      op: 'subscribed',
      channel: 'price.equity',
      rid: 'capture',
    },
    {
      op: 'error',
      channel: 'price.crypto',
      rid: 'capture',
      code: 'bad_filter',
    },
    {
      op: 'authed',
      rid: 'capture-auth',
    },
    {
      op: 'pong',
      rid: 'capture-auth-ping',
    },
  ])('accepts the captured $op acknowledgement', (frame) => {
    expect(PolyboltAckSchema.parse(frame)).toEqual(frame);
  });
  it('preserves unknown rejection codes and request correlation', () => {
    const frame = {
      op: 'error',
      channel: 'price.crypto',
      rid: 'future-rejection',
      code: 'future_error_code',
    };
    expect(PolyboltAckSchema.parse(frame)).toEqual(frame);
  });
  it('normalizes price.crypto btcusd history', () => {
    const event = parsePolyboltEvent(
      PolyboltEnvelopeSchema.parse({
        v: 1,
        channel: 'price.crypto',
        seq: 1,
        ts: 1788886176000,
        snapshot: true,
        payload: {
          data: [
            {
              full_accuracy_value: '78803.76173179',
              timestamp: 1788886057000,
              value: 78803.76173179,
            },
            {
              full_accuracy_value: '78801.86287741',
              timestamp: 1788886058000,
              value: 78801.86287741,
            },
          ],
          symbol: 'btcusd',
        },
      }),
    );
    expect(event).toEqual({
      topic: 'prices.crypto',
      type: 'subscribe',
      timestamp: 1788886176000,
      seq: 1,
      payload: {
        symbol: 'btcusd',
        data: [
          {
            timestamp: 1788886057000,
            value: '78803.76173179',
          },
          {
            timestamp: 1788886058000,
            value: '78801.86287741',
          },
        ],
      },
    });
  });

  it('normalizes price.crypto ethusd history', () => {
    const event = parsePolyboltEvent(
      PolyboltEnvelopeSchema.parse({
        v: 1,
        channel: 'price.crypto',
        seq: 2,
        ts: 1788886176000,
        snapshot: true,
        payload: {
          data: [
            {
              full_accuracy_value: '2496.60283171',
              timestamp: 1788886057000,
              value: 2496.60283171,
            },
            {
              full_accuracy_value: '2496.51150355',
              timestamp: 1788886058000,
              value: 2496.51150355,
            },
          ],
          symbol: 'ethusd',
        },
      }),
    );
    expect(event).toEqual({
      topic: 'prices.crypto',
      type: 'subscribe',
      timestamp: 1788886176000,
      seq: 2,
      payload: {
        symbol: 'ethusd',
        data: [
          {
            timestamp: 1788886057000,
            value: '2496.60283171',
          },
          {
            timestamp: 1788886058000,
            value: '2496.51150355',
          },
        ],
      },
    });
  });

  it('normalizes price.crypto btcusdt history', () => {
    const event = parsePolyboltEvent(
      PolyboltEnvelopeSchema.parse({
        v: 1,
        channel: 'price.crypto',
        seq: 3,
        ts: 1788886176645,
        snapshot: true,
        payload: {
          data: [],
          symbol: 'btcusdt',
        },
      }),
    );
    expect(event).toEqual({
      topic: 'prices.crypto',
      type: 'subscribe',
      timestamp: 1788886176645,
      seq: 3,
      payload: {
        symbol: 'btcusdt',
        data: [],
      },
    });
  });

  it('normalizes price.crypto.twap btcusd history 30s', () => {
    const event = parsePolyboltEvent(
      PolyboltEnvelopeSchema.parse({
        v: 1,
        channel: 'price.crypto.twap',
        seq: 1,
        ts: 1788886176645,
        snapshot: true,
        payload: {
          data: [],
          symbol: 'btcusd',
          window_seconds: 30,
        },
      }),
    );
    expect(event).toBeUndefined();
  });

  it('normalizes price.crypto.twap btcusd history 60s', () => {
    const event = parsePolyboltEvent(
      PolyboltEnvelopeSchema.parse({
        v: 1,
        channel: 'price.crypto.twap',
        seq: 2,
        ts: 1788886175000,
        snapshot: true,
        payload: {
          data: [
            {
              full_accuracy_value: '78788.525642908795142144',
              timestamp: 1788886057000,
              value: 78788.52564290879,
            },
            {
              full_accuracy_value: '78788.786579938813673472',
              timestamp: 1788886058000,
              value: 78788.78657993881,
            },
          ],
          symbol: 'btcusd',
          window_seconds: 60,
        },
      }),
    );
    expect(event).toEqual({
      topic: 'prices.crypto.twap',
      type: 'subscribe',
      timestamp: 1788886175000,
      seq: 2,
      payload: {
        symbol: 'btcusd',
        data: [
          {
            timestamp: 1788886057000,
            value: '78788.525642908795142144',
          },
          {
            timestamp: 1788886058000,
            value: '78788.786579938813673472',
          },
        ],
        windowSeconds: 60,
      },
    });
  });

  it('normalizes price.equity aapl history', () => {
    const event = parsePolyboltEvent(
      PolyboltEnvelopeSchema.parse({
        v: 1,
        channel: 'price.equity',
        seq: 1,
        ts: 1788886176400,
        snapshot: true,
        payload: {
          data: [
            {
              full_accuracy_value: '316.11',
              timestamp: 1788886056800,
              value: 316.11,
            },
            {
              full_accuracy_value: '316.11',
              timestamp: 1788886057000,
              value: 316.11,
            },
          ],
          symbol: 'aapl',
        },
      }),
    );
    expect(event).toEqual({
      topic: 'prices.equity',
      type: 'subscribe',
      timestamp: 1788886176400,
      seq: 1,
      payload: {
        symbol: 'aapl',
        data: [
          {
            timestamp: 1788886056800,
            value: '316.11',
          },
          {
            timestamp: 1788886057000,
            value: '316.11',
          },
        ],
      },
    });
  });

  it('normalizes price.equity aapl update', () => {
    const event = parsePolyboltEvent(
      PolyboltEnvelopeSchema.parse({
        v: 1,
        channel: 'price.equity',
        seq: 2,
        ts: 1788886176600,
        payload: {
          full_accuracy_value: '316.1',
          received_at: 1788886176600,
          symbol: 'aapl',
          timestamp: 1788886176600,
          value: 316.1,
        },
      }),
    );
    expect(event).toEqual({
      topic: 'prices.equity',
      type: 'update',
      timestamp: 1788886176600,
      seq: 2,
      payload: {
        symbol: 'aapl',
        timestamp: 1788886176600,
        value: '316.1',
        receivedAt: 1788886176600,
      },
    });
  });

  it('normalizes price.crypto ethusd update', () => {
    const event = parsePolyboltEvent(
      PolyboltEnvelopeSchema.parse({
        v: 1,
        channel: 'price.crypto',
        seq: 4,
        ts: 1788886177000,
        payload: {
          full_accuracy_value: '2497.38586148',
          symbol: 'ethusd',
          timestamp: 1788886177000,
          value: 2497.38586148,
        },
      }),
    );
    expect(event).toEqual({
      topic: 'prices.crypto',
      type: 'update',
      timestamp: 1788886177000,
      seq: 4,
      payload: {
        symbol: 'ethusd',
        timestamp: 1788886177000,
        value: '2497.38586148',
      },
    });
  });

  it('normalizes price.crypto btcusd update', () => {
    const event = parsePolyboltEvent(
      PolyboltEnvelopeSchema.parse({
        v: 1,
        channel: 'price.crypto',
        seq: 5,
        ts: 1788886177000,
        payload: {
          full_accuracy_value: '78794.15450441',
          symbol: 'btcusd',
          timestamp: 1788886177000,
          value: 78794.15450441,
        },
      }),
    );
    expect(event).toEqual({
      topic: 'prices.crypto',
      type: 'update',
      timestamp: 1788886177000,
      seq: 5,
      payload: {
        symbol: 'btcusd',
        timestamp: 1788886177000,
        value: '78794.15450441',
      },
    });
  });

  it('normalizes price.crypto.twap btcusd update 60s', () => {
    const event = parsePolyboltEvent(
      PolyboltEnvelopeSchema.parse({
        v: 1,
        channel: 'price.crypto.twap',
        seq: 3,
        ts: 1788886177000,
        payload: {
          full_accuracy_value: '78803.715261094101516288',
          symbol: 'btcusd',
          timestamp: 1788886177000,
          value: 78803.7152610941,
          window_seconds: 60,
        },
      }),
    );
    expect(event).toEqual({
      topic: 'prices.crypto.twap',
      type: 'update',
      timestamp: 1788886177000,
      seq: 3,
      payload: {
        symbol: 'btcusd',
        timestamp: 1788886177000,
        value: '78803.715261094101516288',
        windowSeconds: 60,
      },
    });
  });
  it('prefers exact decimal fields and carries equity metadata and drop counts', () => {
    const event = parsePolyboltEvent(
      PolyboltEnvelopeSchema.parse({
        v: 1,
        channel: 'price.equity',
        seq: 12,
        ts: 123456,
        dropped: 3,
        payload: {
          symbol: 'aapl',
          timestamp: 123455,
          value: 123.45,
          full_accuracy_value: '123.450000000000000001',
          received_at: 123457,
          is_carried_forward: true,
        },
      }),
    );
    expect(event).toMatchObject({
      dropped: 3,
      seq: 12,
      timestamp: 123456,
      payload: {
        value: '123.450000000000000001',
        receivedAt: 123457,
        isCarriedForward: true,
      },
    });
  });

  it('ignores malformed or unsupported frames', () => {
    expect(
      PolyboltEnvelopeSchema.safeParse({ v: 2, channel: 'price.crypto' })
        .success,
    ).toBe(false);
    expect(
      parsePolyboltEvent(
        PolyboltEnvelopeSchema.parse({
          v: 1,
          channel: 'price.crypto',
          seq: 1,
          ts: 123,
          payload: {},
        }),
      ),
    ).toBeUndefined();
  });
});
