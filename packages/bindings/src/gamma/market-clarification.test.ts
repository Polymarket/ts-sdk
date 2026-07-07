import { describe, expect, it } from 'vitest';
import {
  MarketClarificationSchema,
  MarketClarificationState,
} from './market-clarification';

const QUESTION_ID = `0x${'1'.repeat(64)}`;
const TX_HASH = `0x${'a'.repeat(64)}`;
const ADAPTER_ADDRESS = `0x${'b'.repeat(40)}`;

describe('MarketClarificationSchema', () => {
  it('normalizes a full clarification record', () => {
    const result = MarketClarificationSchema.parse({
      id: 123,
      marketId: 512038,
      eventId: 20001,
      questionId: QUESTION_ID,
      content: 'Resolves YES if the price is at or above the strike.',
      state: 'success',
      clearBook: false,
      notifyDiscord: true,
      showInFrontend: true,
      adapterAddress: ADAPTER_ADDRESS,
      negRiskRequestId: 'req-1',
      txHash: TX_HASH,
      createdAt: '2025-06-01T00:00:00Z',
      queuedAt: '2025-06-01T00:01:00Z',
      scheduledFor: '2025-06-01T00:05:00Z',
      txTimestamp: '2025-06-01T00:06:00Z',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 123,
        // numeric upstream ids are branded as strings
        marketId: '512038',
        eventId: '20001',
        questionId: QUESTION_ID,
        state: MarketClarificationState.Success,
        adapterAddress: ADAPTER_ADDRESS,
        txHash: TX_HASH,
        createdAt: '2025-06-01T00:00:00Z',
        txTimestamp: '2025-06-01T00:06:00Z',
      }),
    );
  });

  it('accepts a sparse record with nullish optional fields', () => {
    const result = MarketClarificationSchema.parse({
      id: 7,
      marketId: '900',
      content: null,
      state: null,
      clearBook: null,
    });

    expect(result.id).toBe(7);
    expect(result.marketId).toBe('900');
    expect(result.state).toBeNull();
  });
});
