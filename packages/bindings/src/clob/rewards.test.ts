import { describe, expect, it } from 'vitest';
import { PaginatedRewardMarketsSchema } from './rewards';

describe('reward market discovery', () => {
  it('retains complete market metadata even when reward configs and end date are empty', () => {
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
          end_date: '',
        },
      ],
    });
    expect(page.data[0]).toMatchObject({
      marketId: '12',
      eventId: '1',
      rewardsConfig: [],
      endDate: undefined,
      volume24hr: '100',
      oneDayPriceChange: '-0.2',
    });
    expect(page.data[0]?.tokens[0]?.assetId).toBe('1');
  });
});
