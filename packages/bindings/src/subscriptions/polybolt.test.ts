import { describe, expect, it } from 'vitest';
import captured from './__fixtures__/polybolt/staging.json';
import {
  PolyboltAckSchema,
  PolyboltEnvelopeSchema,
  parsePolyboltEvent,
} from './polybolt';

describe('realtime frame normalization', () => {
  it('accepts every captured staging frame and normalizes all price payloads', () => {
    for (const frame of captured) {
      if ('op' in frame) {
        expect(PolyboltAckSchema.safeParse(frame).success).toBe(true);
        continue;
      }
      const envelope = PolyboltEnvelopeSchema.parse(frame);
      const event = parsePolyboltEvent(envelope);
      if (envelope.channel === 'price.polymarket' && envelope.snapshot) {
        expect(event).toBeUndefined();
        continue;
      }
      expect(event).toBeDefined();
      expect(event?.timestamp).toBe(frame.ts);
      expect(event?.seq).toBe(frame.seq);
    }
  });

  it('preserves the actual TWAP decimal encoding in live updates and history', () => {
    for (const frame of captured.filter(
      (frame) => frame.channel === 'price.crypto.twap',
    )) {
      if ('op' in frame) continue;
      const event = parsePolyboltEvent(PolyboltEnvelopeSchema.parse(frame));
      expect(event?.topic).toBe('prices.crypto.twap');
      if (
        event?.type === 'update' &&
        'value' in event.payload &&
        frame.payload &&
        'full_accuracy_value' in frame.payload
      )
        expect(event.payload.value).toBe(frame.payload.full_accuracy_value);
    }
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

  it('normalizes BBO identifiers and ignores malformed or unsupported frames', () => {
    const event = parsePolyboltEvent(
      PolyboltEnvelopeSchema.parse({
        v: 1,
        channel: 'price.polymarket',
        seq: 1,
        ts: 123456,
        payload: {
          market: `0x${'1'.repeat(64)}`,
          asset_id: '123',
          best_bid: '0.4',
          best_ask: '0.5',
          hash: 'abc',
          timestamp: 123456,
        },
      }),
    );
    expect(event).toMatchObject({
      topic: 'prices.polymarket',
      payload: {
        assetId: '123',
        conditionId: `0x${'1'.repeat(64)}`,
        bestBid: '0.4',
        bestAsk: '0.5',
      },
    });
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

  it('delivers BBO updates when either book side is empty', () => {
    const event = parsePolyboltEvent(
      PolyboltEnvelopeSchema.parse({
        v: 1,
        channel: 'price.polymarket',
        seq: 2,
        ts: 123456,
        payload: {
          market: `0x${'1'.repeat(64)}`,
          asset_id: '123',
          best_bid: '',
          best_ask: '0.5',
          hash: 'abc',
          timestamp: 123456,
        },
      }),
    );
    expect(event).toMatchObject({
      topic: 'prices.polymarket',
      payload: { bestBid: null, bestAsk: '0.5' },
    });
  });
});
