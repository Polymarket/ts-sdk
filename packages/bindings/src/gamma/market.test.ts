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

const CTF_CONDITION_ID = `0x${'ab'.repeat(32)}`;
const POLYV2_CONDITION_ID =
  '0x012def24bfb0c5c57fb236fac08b94236a0000000000000000000000000000';
const PADDED_POLYV2_CONDITION_ID = `${POLYV2_CONDITION_ID}00`;
const UNKNOWN_MODULE_CONDITION_ID =
  '0x042def24bfb0c5c57fb236fac08b94236a0000000000000000000000000000';

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
      yes: {
        label: 'Yes',
        tokenId: null,
        positionId: null,
        price: '0.4',
      },
      no: {
        label: 'No',
        tokenId: null,
        positionId: null,
        price: '0.6',
      },
    });
  });

  it.each([
    {
      name: 'legacy market',
      identifiers: { clobTokenIds: '["11", "12"]' },
      expected: {
        yes: { tokenId: '11', positionId: null },
        no: { tokenId: '12', positionId: null },
      },
      marketPositionIds: [],
    },
    {
      name: 'PolyV2 market',
      identifiers: { positionIds: '["21", "22"]' },
      expected: {
        yes: { tokenId: null, positionId: '21' },
        no: { tokenId: null, positionId: '22' },
      },
      marketPositionIds: ['21', '22'],
    },
    {
      name: 'CTF market with Combos',
      identifiers: {
        clobTokenIds: '["11", "12"]',
        positionIds: '["21", "22"]',
      },
      expected: {
        yes: { tokenId: '11', positionId: '21' },
        no: { tokenId: '12', positionId: '22' },
      },
      marketPositionIds: ['21', '22'],
    },
  ])('normalizes outcome identifiers for a $name', ({
    identifiers,
    expected,
    marketPositionIds,
  }) => {
    const market = MarketSchema.parse({
      ...rawBinaryMarket,
      ...identifiers,
    });

    expect(market.outcomes.yes).toEqual(expect.objectContaining(expected.yes));
    expect(market.outcomes.no).toEqual(expect.objectContaining(expected.no));
    expect(market.positionIds).toEqual(marketPositionIds);
  });

  it.each([
    CTF_CONDITION_ID,
    POLYV2_CONDITION_ID,
    PADDED_POLYV2_CONDITION_ID,
    UNKNOWN_MODULE_CONDITION_ID,
  ])('normalizes the polymorphic condition ID %s', (conditionId) => {
    const market = MarketSchema.parse({
      ...rawBinaryMarket,
      conditionId,
    });

    expect(market.conditionId).toBe(conditionId);
  });

  it('reports a non-hex condition ID as a validation failure', () => {
    const result = MarketSchema.safeParse({
      ...rawBinaryMarket,
      conditionId: 'not-hex',
    });

    expect(result.success).toBe(false);
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
