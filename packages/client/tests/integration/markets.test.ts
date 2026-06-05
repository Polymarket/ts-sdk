import { createPublicClient, UserInputError } from '@polymarket/client';
import { expectPresent } from '@polymarket/types';
import { describe, expect, it } from './fixtures';
import { expectNonEmptyPage, expectPageWindow } from './helpers';

const TEST_USER = '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b';
const publicClient = createPublicClient();

const {
  items: [market],
} = await publicClient
  .listMarkets({
    closed: false,
    pageSize: 1,
  })
  .firstPage()
  .then(expectNonEmptyPage);

const {
  items: [position],
} = await publicClient
  .listPositions({
    user: TEST_USER,
    pageSize: 1,
  })
  .firstPage()
  .then(expectNonEmptyPage);

const positionConditionId = expectPresent(position.conditionId);

describe('Markets', () => {
  describe('listMarkets', () => {
    it('fetches markets', async ({ publicClient }) => {
      const paginator = publicClient.listMarkets({
        closed: false,
        pageSize: 100,
      });
      const firstPage = await paginator.firstPage().then(expectNonEmptyPage);

      expect(firstPage.items.length).toBeGreaterThan(0);
      await expectPageWindow(paginator, firstPage, 99);
    });
  });

  describe('fetchMarket', () => {
    it('fetches a market by id and slug', async ({ publicClient }) => {
      const marketById = await publicClient.fetchMarket({
        id: market.id,
      });

      const marketBySlug = await publicClient.fetchMarket({
        slug: expectPresent(market.slug),
      });

      expect(marketById.id).toBe(market.id);
      expect(marketBySlug.id).toBe(market.id);
    });

    it('fetches a market by URL', async ({ publicClient }) => {
      const marketByUrl = await publicClient.fetchMarket({
        url: `https://polymarket.com/event/${expectPresent(market.slug)}`,
      });

      expect(marketByUrl.id).toBe(market.id);
    });

    it('rejects invalid and non-market URLs', async ({ publicClient }) => {
      await expect(
        publicClient.fetchMarket({
          url: 'not-a-url',
        }),
      ).rejects.toThrow(UserInputError);

      await expect(
        publicClient.fetchMarket({
          url: 'https://example.com/market/some-market-slug',
        }),
      ).rejects.toThrow(UserInputError);

      await expect(
        publicClient.fetchMarket({
          url: 'https://polymarket.com/tag/politics',
        }),
      ).rejects.toThrow(UserInputError);
    });
  });

  describe('fetchMarketTags', () => {
    it("fetches a market's tags by id", async ({ publicClient }) => {
      const result = await publicClient.fetchMarketTags({
        id: market.id,
      });

      expect(result).toEqual(expect.any(Array));

      for (const tag of result) {
        expect(tag).toEqual(
          expect.objectContaining({
            id: expect.any(String),
          }),
        );
      }
    });
  });

  describe('listMarketHolders', () => {
    it('lists top holders for a market', async ({ publicClient }) => {
      const result = await publicClient.listMarketHolders({
        market: [positionConditionId],
        limit: 1,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toEqual(
        expect.objectContaining({
          holders: expect.any(Array),
          token: expect.any(String),
        }),
      );
    });
  });

  describe('listOpenInterest', () => {
    it('lists open interest for a market', async ({ publicClient }) => {
      const result = await publicClient.listOpenInterest({
        market: [positionConditionId],
      });

      expect(result).toEqual([
        expect.objectContaining({
          market: positionConditionId,
          value: expect.any(String),
        }),
      ]);
    });
  });

  describe('listMarketPositions', () => {
    it('lists positions for a market', async ({ publicClient }) => {
      const result = await publicClient
        .listMarketPositions({
          market: positionConditionId,
          pageSize: 1,
        })
        .firstPage()
        .then(expectNonEmptyPage);

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          positions: expect.any(Array),
          token: expect.any(String),
        }),
      );
    });
  });
});
