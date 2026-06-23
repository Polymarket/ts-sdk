import { describe, expect, it } from 'vitest';
import {
  ListMarketsKeysetResponseSchema,
  ListMarketsResponseSchema,
  MarketSchema,
} from './market';

const rawBinaryMarket = {
  id: '1',
  marketMakerAddress: '0x0000000000000000000000000000000000000000',
  outcomes: '["Yes", "No"]',
  outcomePrices: '["0.4", "0.6"]',
};

// Legacy categorical market shape, e.g.
// who-will-the-world-s-richest-person-be-on-february-27-2021.
const rawMultiOutcomeMarket = {
  id: '2',
  marketMakerAddress: '0x0000000000000000000000000000000000000000',
  outcomes: '["Jeff Bezos", "Elon Musk", "Other"]',
};

describe('MarketSchema', () => {
  it('normalizes binary outcomes', () => {
    const market = MarketSchema.parse(rawBinaryMarket);

    expect(market.outcomes).toEqual({
      yes: { label: 'Yes', tokenId: null, price: '0.4' },
      no: { label: 'No', tokenId: null, price: '0.6' },
    });
  });

  it('fails validation instead of throwing for multi-outcome markets', () => {
    const result = MarketSchema.safeParse(rawMultiOutcomeMarket);

    expect(result.success).toBe(false);
  });
});

describe('ListMarketsKeysetResponseSchema', () => {
  it('omits multi-outcome markets without failing the page', () => {
    const result = ListMarketsKeysetResponseSchema.parse({
      markets: [rawBinaryMarket, rawMultiOutcomeMarket],
      next_cursor: 'cursor-1',
    });

    expect(result.items.map((market) => market.id)).toEqual(['1']);
    expect(result.nextCursor).toBe('cursor-1');
  });
});

describe('ListMarketsResponseSchema', () => {
  it('omits multi-outcome markets without failing the response', () => {
    const markets = ListMarketsResponseSchema.parse([
      rawMultiOutcomeMarket,
      rawBinaryMarket,
    ]);

    expect(markets.map((market) => market.id)).toEqual(['1']);
  });
});
