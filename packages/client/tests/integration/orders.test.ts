import {
  BuilderCodeSchema,
  OrderSide,
  OrderType,
  toOrderId,
} from '@polymarket/bindings';
import { OrderPostStatus } from '@polymarket/bindings/clob';
import {
  createSecureClient,
  InsufficientLiquidityError,
  type Market,
  type SecureClient,
  UserInputError,
} from '@polymarket/client';
import { expectPresent } from '@polymarket/types';
import { afterAll, type MockInstance, vi } from 'vitest';
import {
  describe,
  expect,
  it,
  publicClient,
  runMeteredTests,
} from './fixtures';
import { expectAcceptedOrderResponse } from './helpers';
import { findHighVolumeLowPriceMarket } from './markets';

const market = await findHighVolumeLowPriceMarket(publicClient);
const UNKNOWN_BUILDER_CODE = BuilderCodeSchema.parse(
  '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
);
let marketOrderCleanup:
  | {
      market: Market;
      secureClient: SecureClient;
    }
  | undefined;

describe('Orders', { timeout: 60_000 }, () => {
  describe('estimateMarketPrice', () => {
    it('calculates the price for a market buy at the minimum size', async ({
      annotate,
      publicClient,
    }) => {
      const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
      annotate(`Market ID: ${market.id}`);
      annotate(`Token ID: ${yesTokenId}`);

      const result = await publicClient.estimateMarketPrice({
        amount: expectPresent(market.trading.minimumOrderSize),
        orderType: OrderType.FAK,
        side: OrderSide.BUY,
        tokenId: yesTokenId,
      });

      expect(result).toEqual(expect.any(Number));
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });

    it('throws an explicit liquidity error when an FOK amount cannot fully fill', async ({
      annotate,
      publicClient,
    }) => {
      const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
      annotate(`Market ID: ${market.id}`);
      annotate(`Token ID: ${yesTokenId}`);

      await expect(
        publicClient.estimateMarketPrice({
          orderType: OrderType.FOK,
          amount: Number.MAX_SAFE_INTEGER,
          side: OrderSide.BUY,
          tokenId: yesTokenId,
        }),
      ).rejects.toBeInstanceOf(InsufficientLiquidityError);
    });
  });

  describe('placeMarketOrder', () => {
    afterAll(async () => {
      if (marketOrderCleanup === undefined) {
        return;
      }

      const { market, secureClient } = marketOrderCleanup;
      const page = await secureClient
        .listPositions({
          user: secureClient.account.wallet,
        })
        .firstPage();

      if (page.items.length === 0) {
        return;
      }

      const position = page.items.find(
        (candidate) => candidate.tokenId === market.outcomes.yes.tokenId,
      );

      await secureClient
        .placeMarketOrder({
          side: OrderSide.SELL,
          shares: expectPresent(position?.size),
          tokenId: expectPresent(position?.tokenId),
        })
        .then(expectAcceptedOrderResponse);
    });

    it.runIf(runMeteredTests)(
      'closes leftover inventory or round-trips a minimum-size market order',
      async ({ annotate, secureClientWithDepositWallet }) => {
        const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
        annotate(`Market ID: ${market.id}`);
        annotate(`Token ID: ${yesTokenId}`);

        const positions = await secureClientWithDepositWallet
          .listPositions({
            user: secureClientWithDepositWallet.account.wallet,
          })
          .firstPage();
        const existingPosition = positions.items.find(
          (candidate) =>
            candidate.tokenId === yesTokenId && Number(candidate.size ?? 0) > 0,
        );

        if (existingPosition !== undefined) {
          annotate(
            `Found existing position for token ${yesTokenId} with size ${existingPosition.size}, closing it with a market sell order...`,
          );

          const sellResult = await secureClientWithDepositWallet
            .placeMarketOrder({
              side: OrderSide.SELL,
              shares: expectPresent(existingPosition.size),
              tokenId: yesTokenId,
            })
            .then(expectAcceptedOrderResponse);

          expect(sellResult.orderId).not.toBe('');

          // Follow the matched order to settlement: hashes must surface
          // regardless of whether the venue settles trades synchronously
          // (hashes in the order response) or asynchronously (trade ids
          // in the order response, hashes on the trades).
          const sellHashes =
            await secureClientWithDepositWallet.waitForOrderFillSettlement(
              sellResult,
            );

          expect(sellHashes.length).toBeGreaterThan(0);
          return;
        }

        annotate(
          'No existing positions found, placing a minimum-size buy market order...',
        );

        const buyResult = await secureClientWithDepositWallet
          .placeMarketOrder({
            amount: 1,
            side: OrderSide.BUY,
            tokenId: yesTokenId,
          })
          .then(expectAcceptedOrderResponse);

        expect(buyResult.orderId).not.toBe('');

        // Follow the matched order to settlement (see the sell branch note).
        const buyHashes =
          await secureClientWithDepositWallet.waitForOrderFillSettlement(
            buyResult,
          );

        expect(buyHashes.length).toBeGreaterThan(0);
      },
    );
  });

  describe('createMarketOrder', () => {
    it('carries builder attribution onto the prepared market order', async ({
      annotate,
      builderCode,
      secureClientWithDepositWallet,
    }) => {
      const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
      annotate(`Market ID: ${market.id}`);
      annotate(`Token ID: ${yesTokenId}`);

      const order = await secureClientWithDepositWallet.createMarketOrder({
        amount: expectPresent(market.trading.minimumOrderSize),
        builderCode,
        side: OrderSide.BUY,
        tokenId: yesTokenId,
      });

      expect(order.builder).toBe(builderCode);
    });

    it('reports unknown builder codes as user input errors when resolving buy amounts against max spend', async ({
      annotate,
      secureClientWithDepositWallet,
    }) => {
      const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
      const minimumOrderSize = expectPresent(market.trading.minimumOrderSize);
      annotate(`Market ID: ${market.id}`);
      annotate(`Token ID: ${yesTokenId}`);

      await expect(
        secureClientWithDepositWallet.createMarketOrder({
          amount: minimumOrderSize,
          builderCode: UNKNOWN_BUILDER_CODE,
          maxSpend: minimumOrderSize,
          side: OrderSide.BUY,
          tokenId: yesTokenId,
        }),
      ).rejects.toThrow(UserInputError);
    });
  });

  describe('order metadata caching', () => {
    it('reuses cached metadata for repeated limit and protected market orders', async ({
      randomEoaSigner,
    }) => {
      const tokenId = expectPresent(market.outcomes.yes.tokenId);
      const client = await createSecureClient({
        signer: randomEoaSigner,
        wallet: await randomEoaSigner.getAddress(),
      });

      await client.createLimitOrder({
        price: expectPresent(market.trading.minimumTickSize),
        side: OrderSide.BUY,
        size: expectPresent(market.trading.minimumOrderSize),
        tokenId,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      try {
        await client.createLimitOrder({
          price: expectPresent(market.trading.minimumTickSize),
          side: OrderSide.BUY,
          size: expectPresent(market.trading.minimumOrderSize),
          tokenId,
        });
        await client.createMarketOrder({
          amount: expectPresent(market.trading.minimumOrderSize),
          maxPrice: expectPresent(market.trading.minimumTickSize),
          side: OrderSide.BUY,
          tokenId,
        });

        expect(requestedUrls(fetchSpy)).toEqual([]);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('uses only the live order book for unprotected market orders without maxSpend', async ({
      randomEoaSigner,
    }) => {
      const tokenId = expectPresent(market.outcomes.yes.tokenId);
      const client = await createSecureClient({
        signer: randomEoaSigner,
        wallet: await randomEoaSigner.getAddress(),
      });
      const request = {
        amount: expectPresent(market.trading.minimumOrderSize),
        orderType: OrderType.FAK as const,
        side: OrderSide.BUY as const,
        tokenId,
      };
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      try {
        await client.createMarketOrder(request);
        await client.createMarketOrder(request);

        expect(requestedUrls(fetchSpy)).toHaveLength(2);
        expect(countRequests(fetchSpy, '/book')).toBe(2);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('coalesces concurrent cold metadata reads', async ({
      randomEoaSigner,
    }) => {
      const tokenId = expectPresent(market.outcomes.yes.tokenId);
      const client = await createSecureClient({
        signer: randomEoaSigner,
        wallet: await randomEoaSigner.getAddress(),
      });
      const request = {
        price: expectPresent(market.trading.minimumTickSize),
        side: OrderSide.BUY as const,
        size: expectPresent(market.trading.minimumOrderSize),
        tokenId,
      };
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      try {
        await Promise.all([
          client.createLimitOrder(request),
          client.createLimitOrder(request),
        ]);

        expect(countRequests(fetchSpy, '/markets-by-token/')).toBe(1);
        expect(countRequests(fetchSpy, '/clob-markets/')).toBe(1);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('adds action input names to tick-grid validation errors', async ({
      randomEoaSigner,
    }) => {
      const tokenId = expectPresent(market.outcomes.yes.tokenId);
      const invalidPrice = expectPresent(market.trading.minimumTickSize) / 2;
      const client = await createSecureClient({
        signer: randomEoaSigner,
        wallet: await randomEoaSigner.getAddress(),
      });

      await expect(
        client.createLimitOrder({
          price: invalidPrice,
          side: OrderSide.BUY,
          size: expectPresent(market.trading.minimumOrderSize),
          tokenId,
        }),
      ).rejects.toThrow('Price must be between');
      await expect(
        client.createMarketOrder({
          amount: expectPresent(market.trading.minimumOrderSize),
          maxPrice: invalidPrice,
          side: OrderSide.BUY,
          tokenId,
        }),
      ).rejects.toThrow('maxPrice must be between');
    });

    it('caches market fees for repeated maxSpend preparations', async ({
      randomEoaSigner,
    }) => {
      const tokenId = expectPresent(market.outcomes.yes.tokenId);
      const client = await createSecureClient({
        signer: randomEoaSigner,
        wallet: await randomEoaSigner.getAddress(),
      });
      const request = {
        amount: expectPresent(market.trading.minimumOrderSize),
        maxPrice: expectPresent(market.trading.minimumTickSize),
        maxSpend: expectPresent(market.trading.minimumOrderSize),
        side: OrderSide.BUY as const,
        tokenId,
      };
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      try {
        await client.createMarketOrder(request);
        await client.createMarketOrder(request);

        expect(countRequests(fetchSpy, '/markets-by-token/')).toBe(1);
        expect(countRequests(fetchSpy, '/clob-markets/')).toBe(1);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('caches builder fees for repeated attributed maxSpend preparations', async ({
      builderCode,
      randomEoaSigner,
    }) => {
      const tokenId = expectPresent(market.outcomes.yes.tokenId);
      const client = await createSecureClient({
        signer: randomEoaSigner,
        wallet: await randomEoaSigner.getAddress(),
      });
      const request = {
        amount: expectPresent(market.trading.minimumOrderSize),
        builderCode,
        maxPrice: expectPresent(market.trading.minimumTickSize),
        maxSpend: expectPresent(market.trading.minimumOrderSize),
        side: OrderSide.BUY as const,
        tokenId,
      };
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      try {
        await client.createMarketOrder(request);
        await client.createMarketOrder(request);

        expect(countRequests(fetchSpy, '/fees/builder-fees/')).toBe(1);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('placeLimitOrder', () => {
    it('allows to place a limit order for the desired size and price', async ({
      annotate,
      secureClientWithDepositWallet,
    }) => {
      const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
      annotate(`Market ID: ${market.id}`);
      annotate(`Token ID: ${yesTokenId}`);
      const minPrice = expectPresent(market.trading.minimumTickSize);
      const minSize = expectPresent(market.trading.minimumOrderSize);

      const result = await secureClientWithDepositWallet.placeLimitOrder({
        price: minPrice,
        side: OrderSide.BUY,
        size: minSize,
        tokenId: yesTokenId,
      });

      expect(result.ok).toBe(true);
    });

    it('carries post-only submission options onto the prepared order', async ({
      annotate,
      builderCode,

      secureClientWithDepositWallet,
    }) => {
      const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
      annotate(`Market ID: ${market.id}`);
      annotate(`Token ID: ${yesTokenId}`);
      const minPrice = expectPresent(market.trading.minimumTickSize);
      const minSize = expectPresent(market.trading.minimumOrderSize);

      const order = await secureClientWithDepositWallet.createLimitOrder({
        builderCode,
        postOnly: true,
        price: minPrice,
        side: OrderSide.BUY,
        size: minSize,
        tokenId: yesTokenId,
      });

      expect(order.postOnly).toBe(true);
      expect(order.builder).toBe(builderCode);
    });

    // Enable once this suite runs against the staging Tenderly vnet with a fake
    // collateral balance assigned to the fresh Deposit Wallet. The fresh wallet
    // naturally has zero exchange allowance, so this avoids revoking live
    // approval state on the shared funded Deposit Wallet.
    it.skip('requests a collateral approval if necessary', async ({
      annotate,
      newDepositWalletClient,
    }) => {
      const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
      annotate(`Market ID: ${market.id}`);
      annotate(`Token ID: ${yesTokenId}`);
      const minPrice = expectPresent(market.trading.minimumTickSize);
      const minSize = expectPresent(market.trading.minimumOrderSize);

      const response = await newDepositWalletClient.placeLimitOrder({
        price: minPrice,
        side: OrderSide.BUY,
        size: minSize,
        tokenId: yesTokenId,
      });

      expect(response.ok).toBe(true);
      const acceptedResponse = expectAcceptedOrderResponse(response);

      const cancelResult = await newDepositWalletClient.cancelOrder({
        orderId: acceptedResponse.orderId,
      });
      expect(cancelResult.canceled).toContain(acceptedResponse.orderId);
    });
  });

  describe('placeLimitOrder', () => {
    it('creates, signs, and posts a limit order in one workflow', async ({
      annotate,
      secureClientWithDepositWallet,
    }) => {
      const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
      annotate(`Market ID: ${market.id}`);
      annotate(`Token ID: ${yesTokenId}`);
      const minPrice = expectPresent(market.trading.minimumTickSize);
      const minSize = expectPresent(market.trading.minimumOrderSize);

      const response = await secureClientWithDepositWallet.placeLimitOrder({
        postOnly: true,
        price: minPrice,
        side: OrderSide.BUY,
        size: minSize,
        tokenId: yesTokenId,
      });

      expect(response.ok).toBe(true);
      const acceptedResponse = expectAcceptedOrderResponse(response);

      expect(acceptedResponse.status).toBe(OrderPostStatus.LIVE);
    });
  });

  describe('cancelOrder', () => {
    it('cancels a single open order', async ({
      annotate,
      secureClientWithDepositWallet,
    }) => {
      const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
      annotate(`Market ID: ${market.id}`);
      annotate(`Token ID: ${yesTokenId}`);

      const { orderId } = await createRestingLimitOrder(
        secureClientWithDepositWallet,
        market,
      );
      const result = await secureClientWithDepositWallet.cancelOrder({
        orderId,
      });

      expect(result.canceled).toContain(orderId);

      const { items } = await secureClientWithDepositWallet
        .listOpenOrders({
          market: market.id,
        })
        .firstPage();

      expect(items.some((order) => order.id === orderId)).toBe(false);
    });
  });

  describe('postOrders', () => {
    it('posts multiple resting limit orders', async ({
      annotate,
      secureClientWithDepositWallet,
    }) => {
      const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
      annotate(`Market ID: ${market.id}`);
      annotate(`Token ID: ${yesTokenId}`);

      const firstOrder = await createSignedRestingLimitOrder(
        secureClientWithDepositWallet,
        market,
      );
      const secondOrder = await createSignedRestingLimitOrder(
        secureClientWithDepositWallet,
        market,
      );
      const responses = await secureClientWithDepositWallet.postOrders([
        firstOrder,
        secondOrder,
      ]);

      expect(responses).toHaveLength(2);
      expect(responses.every((response) => response.ok)).toBe(true);

      for (const response of responses) {
        const acceptedResponse = expectAcceptedOrderResponse(response);

        expect(acceptedResponse.orderId).not.toBe('');
        expect(acceptedResponse.status).toBe(OrderPostStatus.LIVE);
      }

      await secureClientWithDepositWallet.cancelAll();
    });
  });

  describe('cancelOrders', () => {
    it('cancels multiple open orders', async ({
      annotate,
      secureClientWithDepositWallet,
    }) => {
      const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
      annotate(`Market ID: ${market.id}`);
      annotate(`Token ID: ${yesTokenId}`);

      const firstOrder = await createRestingLimitOrder(
        secureClientWithDepositWallet,
        market,
      );
      const secondOrder = await createRestingLimitOrder(
        secureClientWithDepositWallet,
        market,
      );
      const result = await secureClientWithDepositWallet.cancelOrders({
        orderIds: [firstOrder.orderId, secondOrder.orderId],
      });

      expect(result.canceled).toEqual(
        expect.arrayContaining([firstOrder.orderId, secondOrder.orderId]),
      );
    });
  });

  describe('cancelAll', () => {
    it('cancels all open orders', async ({
      annotate,
      secureClientWithDepositWallet,
    }) => {
      const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
      annotate(`Market ID: ${market.id}`);
      annotate(`Token ID: ${yesTokenId}`);

      const order = await createRestingLimitOrder(
        secureClientWithDepositWallet,
        market,
      );
      const result = await secureClientWithDepositWallet.cancelAll();

      expect(result.canceled).toContain(order.orderId);
    });
  });

  describe('cancelMarketOrders', () => {
    it('cancels open orders for a market and asset', async ({
      annotate,
      secureClientWithDepositWallet,
    }) => {
      const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
      annotate(`Market ID: ${market.id}`);
      annotate(`Token ID: ${yesTokenId}`);

      const order = await createRestingLimitOrder(
        secureClientWithDepositWallet,
        market,
      );
      const result = await cancelMarketOrderWithRetry(
        secureClientWithDepositWallet,
        market,
        order,
      );

      expect(result.canceled).toContain(order.orderId);
    });
  });
});

async function createRestingLimitOrder(
  secureClient: SecureClient,
  market: Market,
): Promise<{
  tokenId: string;
  orderId: string;
}> {
  const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
  const tickSize = expectPresent(market.trading.minimumTickSize);
  const size = expectPresent(market.trading.minimumOrderSize);
  const response = await secureClient.placeLimitOrder({
    price: tickSize,
    side: OrderSide.BUY,
    size,
    tokenId: yesTokenId,
  });
  expect(response.ok).toBe(true);
  const acceptedResponse = expectAcceptedOrderResponse(response);

  expect(acceptedResponse.orderId).not.toBe('');
  expect(acceptedResponse.status).toBe(OrderPostStatus.LIVE);

  return {
    tokenId: expectPresent(market.outcomes.yes.tokenId),
    orderId: acceptedResponse.orderId,
  };
}

async function createSignedRestingLimitOrder(
  secureClient: SecureClient,
  market: Market,
) {
  const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
  const tickSize = expectPresent(market.trading.minimumTickSize);
  const size = expectPresent(market.trading.minimumOrderSize);

  return secureClient.createLimitOrder({
    price: tickSize,
    side: OrderSide.BUY,
    size,
    tokenId: yesTokenId,
  });
}

async function cancelMarketOrderWithRetry(
  secureClient: SecureClient,
  market: Market,
  order: {
    tokenId: string;
    orderId: string;
  },
) {
  const conditionId = expectPresent(market.conditionId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await secureClient.cancelMarketOrders({
      tokenId: order.tokenId,
      market: conditionId,
    });

    if (result.canceled.includes(toOrderId(order.orderId))) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return secureClient.cancelMarketOrders({
    tokenId: order.tokenId,
    market: conditionId,
  });
}

function requestedUrls(fetchSpy: MockInstance<typeof fetch>): string[] {
  return fetchSpy.mock.calls.map(([input]) =>
    input instanceof Request ? input.url : String(input),
  );
}

function countRequests(
  fetchSpy: MockInstance<typeof fetch>,
  path: string,
): number {
  return requestedUrls(fetchSpy).filter((url) => url.includes(path)).length;
}
