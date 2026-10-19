import { describe, expect, it } from 'vitest';
import { PaginatedRewardMarketsSchema } from './rewards';

describe('reward market discovery', () => {
  it.each([
    ['', undefined],
    ['2028-11-08 04:59:00+00', '2028-11-08T04:59:00.000Z'],
    ['2028-11-08T04:59:00+00:00', '2028-11-08T04:59:00+00:00'],
  ])('parses discovery metadata with end date %s', (endDate, expected) => {
    const page = PaginatedRewardMarketsSchema.parse({
      limit: 25,
      count: 1,
      next_cursor: 'LTE=',
      data: [
        {
          condition_id: `0x${'ab'.repeat(32)}`,
          market_id: '12',
          event_id: '1',
          market_slug: 'market',
          event_slug: 'event',
          question: 'Question?',
          image: '',
          market_competitiveness: 0.4,
          rewards_config: [],
          rewards_max_spread: 3,
          rewards_min_size: 10,
          spread: 0.1,
          tokens: [{ token_id: '1', outcome: 'Yes', price: 0.5 }],
          group_item_title: '',
          volume_24hr: 100,
          created_at: '2026-10-07T00:00:00Z',
          one_day_price_change: -0.2,
          end_date: endDate,
        },
      ],
    });
    expect(page.data[0]).toMatchObject({
      marketId: '12',
      eventId: '1',
      rewardsConfig: [],
      endDate: expected,
      volume24hr: '100',
      oneDayPriceChange: '-0.2',
    });
    expect(page.data[0]?.tokens[0]?.assetId).toBe('1');
  });
});
