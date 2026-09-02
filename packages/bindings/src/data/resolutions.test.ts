import { describe, expect, it } from 'vitest';
import {
  FetchResolutionsResponseSchema,
  ResolutionMarketType,
  ResolutionReporter,
  ResolutionSource,
  ResolutionStatus,
} from './resolutions';

const QUESTION_ID = `0x${'a'.repeat(64)}`;
const CONDITION_ID = `0x${'b'.repeat(64)}`;

describe('FetchResolutionsResponseSchema', () => {
  it('normalizes a question-keyed oracle lifecycle row', () => {
    const resolutions = FetchResolutionsResponseSchema.parse({
      data: [
        {
          question_id: QUESTION_ID,
          status: 'resolved',
          extended_review: false,
          was_disputed: true,
          new_version_q: true,
          proposed_price: '400000',
          reproposed_price: '600000',
          price: '1000000',
          transaction_hash: `0x${'c'.repeat(64)}`,
          log_index: '17',
          last_update_timestamp: '1722470400',
        },
      ],
    });

    expect(resolutions).toEqual([
      {
        questionId: QUESTION_ID,
        status: ResolutionStatus.Resolved,
        extendedReview: false,
        wasDisputed: true,
        questionRulesUpdated: true,
        proposedPrice: '400000',
        reproposedPrice: '600000',
        price: '1000000',
        transactionHash: `0x${'c'.repeat(64)}`,
        logIndex: 17,
        lastUpdatedAt: '2024-08-01T00:00:00.000Z',
      },
    ]);
  });

  it('normalizes condition lifecycle fields and absent transaction metadata', () => {
    const resolutions = FetchResolutionsResponseSchema.parse({
      data: [
        {
          condition_id: CONDITION_ID,
          status: 'resolved',
          extended_review: false,
          was_disputed: false,
          new_version_q: false,
          proposed_price: '69',
          reproposed_price: '69',
          price: '69',
          transaction_hash: '',
          log_index: '',
          last_update_timestamp: '2026-08-02T03:04:05Z',
          market_type: 'BINARY',
          payouts: [500_000, 500_000],
          resolution_source: 'reported',
          reporter: 'UMA_OO',
          was_arbitrated: false,
          resolved_block: 42,
          resolved_at: '2026-08-02T03:04:05Z',
        },
      ],
    });

    expect(resolutions).toEqual([
      {
        conditionId: CONDITION_ID,
        status: ResolutionStatus.Resolved,
        extendedReview: false,
        wasDisputed: false,
        questionRulesUpdated: false,
        transactionHash: null,
        logIndex: null,
        lastUpdatedAt: '2026-08-02T03:04:05Z',
        marketType: ResolutionMarketType.Binary,
        payouts: ['0.5', '0.5'],
        resolutionSource: ResolutionSource.Reported,
        reporter: ResolutionReporter.UmaOptimisticOracle,
        wasArbitrated: false,
        resolvedBlock: 42,
        resolvedAt: '2026-08-02T03:04:05Z',
      },
    ]);
  });

  it('rejects malformed transaction hashes', () => {
    expect(() =>
      FetchResolutionsResponseSchema.parse({
        data: [
          {
            question_id: QUESTION_ID,
            status: 'resolved',
            extended_review: false,
            was_disputed: false,
            new_version_q: false,
            transaction_hash: 'not-a-transaction-hash',
            log_index: '17',
            last_update_timestamp: '1722470400',
          },
        ],
      }),
    ).toThrow();
  });
});
