import {
  createPublicClient,
  PriceHistoryInterval,
  UnexpectedResponseError,
  UserInputError,
} from '@polymarket/client';
import { expectPresent } from '@polymarket/types';
import { afterEach, vi } from 'vitest';
import { describe, environment, expect, it } from './fixtures';
import { expectNonEmptyPage, expectPageWindow } from './helpers';

const TEST_USER = '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b';
const HOLDERS_CONDITION_ID =
  '0xe546672750517f62c45a5a00067481981e62b9c20fa8220203232c9dc8fd2093';
const OTHER_CONDITION_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
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
    it('walks normalized holder pages with position economics', async ({
      publicClient,
    }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const paginator = publicClient.listMarketHolders({
        conditionIds: [HOLDERS_CONDITION_ID],
        includePnl: true,
        minBalance: 0,
        pageSize: 1,
      });
      const firstPage = await paginator.firstPage().then(expectNonEmptyPage);
      const firstGroup = firstPage.items[0];
      const firstHolder = expectPresent(firstGroup.holders[0]);

      expect(firstGroup).toEqual(
        expect.objectContaining({
          assetId: expect.any(String),
          holders: expect.any(Array),
          token: expect.any(String),
        }),
      );
      expect(firstHolder).toEqual(
        expect.objectContaining({
          amount: expect.any(String),
          assetId: firstGroup.assetId,
          avgPrice: expect.any(String),
          currentPrice: expect.any(String),
          currentValue: expect.any(String),
          entryCostUsdc: expect.any(String),
          realizedPnl: expect.any(String),
          totalPnl: expect.any(String),
          unrealizedPnl: expect.any(String),
          verified: expect.any(Boolean),
          wallet: expect.any(String),
        }),
      );

      await paginator
        .from(firstPage.nextCursor)
        .firstPage()
        .then(expectNonEmptyPage);

      const requests = fetchSpy.mock.calls
        .map(([input]) =>
          input instanceof Request ? input.url : String(input),
        )
        .filter((url) => new URL(url).pathname === '/v2/holders')
        .map((url) => new URL(url).searchParams);

      expect(requests).toHaveLength(2);
      for (const request of requests) {
        expect(request.get('condition')).toBe(HOLDERS_CONDITION_ID);
        expect(request.get('include_pnl')).toBe('true');
        expect(request.get('limit')).toBe('1');
        expect(request.get('min_balance')).toBe('0');
        expect(request.has('market')).toBe(false);
      }
      expect(requests[0]?.has('cursor')).toBe(false);
      expect(requests[1]?.get('cursor')).toBe(firstPage.nextCursor);
    });

    it('rejects invalid PnL requests before transport', ({ publicClient }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      expect(() =>
        publicClient.listMarketHolders({
          conditionIds: [HOLDERS_CONDITION_ID, OTHER_CONDITION_ID],
          includePnl: true,
        }),
      ).toThrow(UserInputError);
      expect(() =>
        publicClient.listMarketHolders({
          conditionIds: [HOLDERS_CONDITION_ID],
          includePnl: true,
          pageSize: 101,
        }),
      ).toThrow(UserInputError);

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('listPriceHistory', () => {
    it('rejects invalid series windows before requesting them', ({
      publicClient,
    }) => {
      const tokenId = expectPresent(market.outcomes.yes.tokenId);

      expect(() =>
        publicClient.listPriceHistory({
          tokenId,
          interval: PriceHistoryInterval.OneWeek,
          bucketSeconds: 60,
        }),
      ).toThrow(UserInputError);
      expect(() =>
        publicClient.listPriceHistory({
          tokenId,
          start: 1_700_000_000,
          end: 1_701_296_001,
        }),
      ).toThrow(UserInputError);
    });

    it('walks normalized price history pages', async ({ publicClient }) => {
      const tokenId = expectPresent(market.outcomes.yes.tokenId);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const paginator = publicClient.listPriceHistory({
        tokenId,
        interval: PriceHistoryInterval.OneDay,
        bucketSeconds: 60,
        pageSize: 2,
      });

      const firstPage = await paginator.firstPage().then(expectNonEmptyPage);

      const firstPoint = firstPage.items[0];
      expect(firstPoint).toEqual(
        expect.objectContaining({
          price: expect.any(String),
          resolutionSeconds: expect.any(Number),
          timestamp: expect.any(Number),
        }),
      );
      expect(firstPoint.timestamp).toBeGreaterThan(1_000_000_000_000);

      const secondPage = await paginator
        .from(firstPage.nextCursor)
        .firstPage()
        .then(expectNonEmptyPage);
      const lastFirstTimestamp = expectPresent(
        firstPage.items.at(-1),
      ).timestamp;
      expect(secondPage.items[0].timestamp).toBeGreaterThan(lastFirstTimestamp);

      const requests = fetchSpy.mock.calls
        .map(([input]) =>
          input instanceof Request ? input.url : String(input),
        )
        .filter((url) => new URL(url).pathname === '/v2/prices-history')
        .map((url) => new URL(url));

      expect(requests).toHaveLength(2);
      for (const request of requests) {
        expect(request.searchParams.get('token_id')).toBe(tokenId);
        expect(request.searchParams.get('interval')).toBe('1d');
        expect(request.searchParams.get('bucket_seconds')).toBe('60');
      }
      expect(requests[1]?.searchParams.get('cursor')).toBe(
        firstPage.nextCursor,
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
