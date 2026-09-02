import {
  createPublicClient,
  UnexpectedResponseError,
  UserInputError,
} from '@polymarket/client';
import { expectPresent } from '@polymarket/types';
import { afterEach, vi } from 'vitest';
import { describe, environment, expect, it } from './fixtures';
import { expectNonEmptyPage, expectPageWindow } from './helpers';

const TEST_USER = '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b';
const publicClient = createPublicClient({ environment });

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

    it('lists closed markets, omitting legacy multi-outcome markets', async ({
      publicClient,
    }) => {
      // The oldest closed markets include legacy multi-outcome categoricals,
      // which previously aborted the whole page with a raw TypeError.
      const firstPage = await publicClient
        .listMarkets({
          closed: true,
          pageSize: 100,
        })
        .firstPage()
        .then(expectNonEmptyPage);

      for (const closedMarket of firstPage.items) {
        expect(closedMarket.outcomes.yes.label).toEqual(expect.any(String));
        expect(closedMarket.outcomes.no.label).toEqual(expect.any(String));
      }
    });
  });

  describe('listComboMarkets', () => {
    it('fetches combo markets with structured outcomes', async ({
      publicClient,
    }) => {
      const page = await publicClient
        .listComboMarkets({ pageSize: 1 })
        .firstPage()
        .then(expectNonEmptyPage);
      const [comboMarket] = page.items;

      expect(comboMarket).toEqual(
        expect.objectContaining({
          conditionId: expect.any(String),
          id: expect.any(String),
          pending: expect.any(Boolean),
          outcomes: {
            yes: expect.any(Object),
            no: expect.any(Object),
          },
          slug: expect.any(String),
          title: expect.any(String),
        }),
      );
      expect(comboMarket.outcomes.yes).toEqual(
        expect.objectContaining({
          label: expect.any(String),
          positionId: expect.any(String),
          price: expect.any(String),
        }),
      );
      expect(comboMarket.outcomes.no).toEqual(
        expect.objectContaining({
          label: expect.any(String),
          positionId: expect.any(String),
          price: expect.any(String),
        }),
      );
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

    it('rejects legacy multi-outcome markets with a typed error', async ({
      publicClient,
    }) => {
      await expect(
        publicClient.fetchMarket({
          slug: 'who-will-the-world-s-richest-person-be-on-february-27-2021',
        }),
      ).rejects.toThrow(UnexpectedResponseError);
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

  describe('fetchOpenInterest', () => {
    it('fetches open interest from the v2 route', async ({ publicClient }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const result = await publicClient.fetchOpenInterest({
        conditionIds: [positionConditionId],
      });

      expect(result).toEqual([
        expect.objectContaining({
          conditionId: positionConditionId,
          value: expect.any(String),
        }),
      ]);

      const requestUrl = fetchSpy.mock.calls
        .map(([input]) =>
          input instanceof Request ? input.url : String(input),
        )
        .find((url) => new URL(url).pathname === '/v2/oi');

      expect(
        new URL(expectPresent(requestUrl)).searchParams.get('condition'),
      ).toBe(positionConditionId);
    });

    it('rejects an invalid condition ID', async ({ publicClient }) => {
      await expect(
        publicClient.fetchOpenInterest({ conditionIds: ['not-a-condition'] }),
      ).rejects.toThrow(UserInputError);
    });

    it('normalizes the global aggregate', async ({ publicClient }) => {
      const result = await publicClient.fetchOpenInterest();

      expect(result).toEqual([
        expect.objectContaining({
          conditionId: null,
          value: expect.any(String),
        }),
      ]);
    });
  });
});
