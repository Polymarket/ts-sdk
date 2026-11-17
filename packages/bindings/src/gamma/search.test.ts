import { describe, expect, it } from 'vitest';
import { EventSchema } from './event';
import { MarketSchema } from './market';
import { PublicSearchResponseSchema } from './search';

const summary = {
  question: 'Will the example happen?',
  slug: 'example-market',
  active: true,
  closed: false,
  archived: false,
  outcomes: ['Yes', 'No'],
  outcomePrices: ['0.6', '0.4'],
  bestBid: 0.59,
  bestAsk: 0.61,
  spread: 0.02,
};

describe('public search responses', () => {
  it('accepts optimized market summaries and preserves neighboring full markets', () => {
    const parsed = PublicSearchResponseSchema.parse({
      events: [{ id: '1', markets: [summary, { ...summary, id: '2' }] }],
      hasMore: true,
    });
    const markets = parsed.events?.[0]?.markets;
    expect(markets).toHaveLength(2);
    expect(markets?.[0]?.id).toBeUndefined();
    expect(markets?.[0]?.slug).toBe('example-market');
    expect(markets?.[0]?.prices).toMatchObject({
      bestBid: '0.59',
      bestAsk: '0.61',
    });
    expect(markets?.[1]?.id).toBe('2');
    expect(parsed.pagination?.hasMore).toBe(true);
  });

  it('retains strict identifiers on ordinary market and event surfaces', () => {
    expect(MarketSchema.safeParse(summary).success).toBe(false);
    expect(EventSchema.safeParse({ id: '1', markets: [summary] }).success).toBe(
      false,
    );
  });

  it('normalizes top-level continuation including false without losing totals', () => {
    expect(
      PublicSearchResponseSchema.parse({
        hasMore: false,
        pagination: { hasMore: true, totalResults: 3 },
      }).pagination,
    ).toEqual({ hasMore: false, totalResults: 3 });
    expect(
      PublicSearchResponseSchema.parse({
        pagination: { hasMore: true, totalResults: 4 },
      }).pagination,
    ).toEqual({ hasMore: true, totalResults: 4 });
    expect(PublicSearchResponseSchema.parse({}).pagination).toBeUndefined();
  });

  it('rejects malformed summary values and retains binary filtering', () => {
    expect(
      PublicSearchResponseSchema.safeParse({
        events: [{ id: '1', markets: [{ ...summary, id: 42 }] }],
      }).success,
    ).toBe(false);
    expect(
      PublicSearchResponseSchema.parse({
        events: [
          {
            id: '1',
            markets: [
              {
                ...summary,
                outcomes: ['A', 'B', 'C'],
                outcomePrices: ['0.3', '0.3', '0.4'],
              },
            ],
          },
        ],
      }).events?.[0]?.markets,
    ).toEqual([]);
  });
});
