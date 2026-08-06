import { OrderSide, type TokenId } from '@polymarket/bindings';
import { PriceHistoryInterval } from '@polymarket/bindings/clob';
import type { PublicClient } from '@polymarket/client';
import { expectPresent } from '@polymarket/types';
import { describe, expect, it } from './fixtures';
import { expectPageWindow } from './helpers';

let liquidClobTokenIdPromise: Promise<TokenId> | undefined;

describe('CLOB', () => {
  describe('fetchOrderBook', () => {
    it('fetches the order book for a token', async ({ publicClient }) => {
      const tokenId = await selectLiquidClobTokenId(publicClient);

      const result = await publicClient.fetchOrderBook({
        tokenId,
      });

      expect(result.tokenId).toBe(tokenId);
      expect(Array.isArray(result.bids)).toBe(true);
      expect(Array.isArray(result.asks)).toBe(true);
      expect(result.tickSize).toEqual(expect.any(Number));
      expect(result.minOrderSize).toEqual(expect.any(String));
      expect(result.negRisk).toEqual(expect.any(Boolean));
      expect(result.hash).toEqual(expect.any(String));
    });
  });

  describe('fetchOrderBooks', () => {
    it('fetches order books for multiple tokens', async ({ publicClient }) => {
      const tokenId = await selectLiquidClobTokenId(publicClient);

      const result = await publicClient.fetchOrderBooks([{ tokenId }]);

      expect(result[0]).toEqual(
        expect.objectContaining({
          tokenId,
          asks: expect.any(Array),
          bids: expect.any(Array),
        }),
      );
    });
  });

  describe('fetchMidpoint', () => {
    it('fetches the midpoint price for a token', async ({ publicClient }) => {
      const tokenId = await selectLiquidClobTokenId(publicClient);

      const result = await publicClient.fetchMidpoint({
        tokenId,
      });

      expect(result).toEqual(expect.any(String));
    });
  });

  describe('fetchMidpoints', () => {
    it('fetches midpoint prices for multiple tokens', async ({
      publicClient,
    }) => {
      const tokenId = await selectLiquidClobTokenId(publicClient);

      const result = await publicClient.fetchMidpoints([{ tokenId }]);

      expect(Object.keys(result)).toContain(tokenId);
      expect(result[tokenId]).toEqual(expect.any(String));
    });
  });

  describe('fetchPrice', () => {
    it('fetches the quoted price for a token and side', async ({
      publicClient,
    }) => {
      const tokenId = await selectLiquidClobTokenId(publicClient);

      const result = await publicClient.fetchPrice({
        tokenId,
        side: OrderSide.BUY,
      });

      expect(result).toEqual(expect.any(String));
    });
  });

  describe('fetchPrices', () => {
    it('fetches quoted prices for multiple tokens', async ({
      publicClient,
    }) => {
      const tokenId = await selectLiquidClobTokenId(publicClient);

      const result = await publicClient.fetchPrices([
        {
          tokenId,
          side: OrderSide.BUY,
        },
      ]);

      expect(Object.keys(result)).toContain(tokenId);
      expect(result[tokenId]?.BUY).toEqual(expect.any(String));
      expect(result[tokenId]?.SELL).toBeUndefined();
    });
  });

  describe('fetchSpread', () => {
    it('fetches the spread for a token', async ({ publicClient }) => {
      const tokenId = await selectLiquidClobTokenId(publicClient);

      const result = await publicClient.fetchSpread({
        tokenId,
      });

      expect(result).toEqual(expect.any(String));
    });
  });

  describe('fetchSpreads', () => {
    it('fetches spreads for multiple tokens', async ({ publicClient }) => {
      const tokenId = await selectLiquidClobTokenId(publicClient);

      const result = await publicClient.fetchSpreads([{ tokenId }]);

      expect(Object.keys(result)).toContain(tokenId);
      expect(result[tokenId]).toEqual(expect.any(String));
    });
  });

  describe('fetchLastTradePrice', () => {
    it('fetches the last traded price for a token', async ({
      publicClient,
    }) => {
      const tokenId = await selectLiquidClobTokenId(publicClient);

      const result = await publicClient.fetchLastTradePrice({
        tokenId,
      });

      expect(result).toEqual(
        expect.objectContaining({
          price: expect.any(String),
          side: expect.any(String),
        }),
      );
    });
  });

  describe('fetchLastTradePrices', () => {
    it('fetches last traded prices for multiple tokens', async ({
      publicClient,
    }) => {
      const tokenId = await selectLiquidClobTokenId(publicClient);

      const result = await publicClient.fetchLastTradePrices([{ tokenId }]);

      expect(result[0]).toEqual(
        expect.objectContaining({
          price: expect.any(String),
          side: expect.any(String),
          tokenId,
        }),
      );
    });
  });

  describe('fetchPriceHistory', () => {
    it('lists historical price points for a token', async ({
      publicClient,
    }) => {
      const tokenId = await selectLiquidClobTokenId(publicClient);

      const result = await publicClient.fetchPriceHistory({
        tokenId,
        interval: PriceHistoryInterval.ONE_DAY,
        fidelity: 60,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toEqual(
        expect.objectContaining({
          p: expect.any(Number),
          t: expect.any(Number),
        }),
      );
    });
  });

  describe('listCurrentRewards', () => {
    it('lists current active market rewards', async ({ publicClient }) => {
      const paginator = publicClient.listCurrentRewards();
      const firstPage = await paginator.firstPage();

      await expectPageWindow(paginator, firstPage, 99);
    });
  });

  describe('listMarketRewards', () => {
    it('fetches reward configurations for a market', async ({
      publicClient,
    }) => {
      const currentRewards = await publicClient
        .listCurrentRewards()
        .firstPage();

      const currentReward = currentRewards.items[0];

      if (currentReward === undefined) {
        return;
      }

      const result = await publicClient
        .listMarketRewards({
          conditionId: currentReward.conditionId,
        })
        .firstPage();

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          conditionId: currentReward.conditionId,
          question: expect.any(String),
          tokens: expect.any(Array),
        }),
      );

      await expectPageWindow(
        publicClient.listMarketRewards({
          conditionId: currentReward.conditionId,
        }),
        result,
        99,
      );
    });
  });
});

async function selectLiquidClobTokenId(
  publicClient: PublicClient,
): Promise<TokenId> {
  liquidClobTokenIdPromise ??= findLiquidClobTokenId(publicClient);

  return liquidClobTokenIdPromise;
}

async function findLiquidClobTokenId(publicClient: PublicClient) {
  const markets = await publicClient
    .listMarkets({
      closed: false,
      pageSize: 100,
      order: 'volume24hr',
      ascending: false,
    })
    .firstPage()
    .then((page) => page.items);

  for (const market of markets) {
    return expectPresent(market.outcomes.yes.tokenId);
  }

  throw new Error('Expected at least one live market with a CLOB token id');
}
