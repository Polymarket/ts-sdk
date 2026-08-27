import { describe, expect, it } from 'vitest';
import { FetchEventLiveVolumeResponseSchema } from './analytics';

const CONDITION_ID = `0x${'ab'.repeat(32)}`;

describe('FetchEventLiveVolumeResponseSchema', () => {
  it('normalizes an empty market condition ID to null', () => {
    const response = FetchEventLiveVolumeResponseSchema.parse([
      {
        total: 3,
        markets: [
          { market: '', value: 1 },
          { market: CONDITION_ID, value: 2 },
        ],
      },
    ]);

    expect(response).toEqual([
      {
        total: '3',
        markets: [
          { conditionId: null, market: null, value: '1' },
          {
            conditionId: CONDITION_ID,
            market: CONDITION_ID,
            value: '2',
          },
        ],
      },
    ]);
  });
});
