import { OrderSide } from '@polymarket/bindings';
import { UserOrderEventType } from '@polymarket/bindings/subscriptions';
import { OrderPostStatus, type SecureClient } from '@polymarket/client';
import { expectPresent } from '@polymarket/types';
import {
  describe,
  expect,
  it,
  publicClient,
  runMeteredTests,
} from './fixtures';
import { expectAcceptedOrderResponse } from './helpers';
import { findHighVolumeLowPriceMarket } from './markets';

const userSubscriptionMarket = await findHighVolumeLowPriceMarket(publicClient);

type EventWithOptionalSymbol = {
  topic: string;
  payload?: {
    symbol?: string;
  };
};

async function collectCryptoSymbols(
  handle: AsyncIterable<EventWithOptionalSymbol>,
  expectedSymbols: readonly string[],
): Promise<Set<string>> {
  const expected = new Set(expectedSymbols);
  const seen = new Set<string>();

  for await (const event of handle) {
    if (event.topic !== 'prices.crypto.binance') continue;
    const symbol = event.payload?.symbol;
    if (symbol !== undefined && expected.has(symbol)) {
      seen.add(symbol);
    }
    if (seen.size === expected.size) break;
  }

  return seen;
}

describe('Subscriptions', () => {
  it('routes public subscriptions and merges their events', async ({
    publicClient,
  }) => {
    const market = await findHighVolumeLowPriceMarket(publicClient);
    const tokenId = expectPresent(market.outcomes.yes.tokenId);

    const handle = await publicClient.subscribe([
      { tokenIds: [tokenId], topic: 'market' },
      { topic: 'sports' },
      { symbols: ['btcusdt'], topic: 'prices.crypto.binance' },
      { symbols: ['ethusdt'], topic: 'prices.crypto.binance' },
    ]);

    try {
      const symbols = await collectCryptoSymbols(
        handle as AsyncIterable<EventWithOptionalSymbol>,
        ['btcusdt', 'ethusdt'],
      );

      expect(symbols).toEqual(new Set(['btcusdt', 'ethusdt']));
    } finally {
      await handle.close();
      await publicClient.closeSubscriptions();
    }
  });

  it('routes secure-only subscriptions when the client supports them', async ({
    secureClientWithDepositWallet,
  }) => {
    try {
      const handle = await secureClientWithDepositWallet.subscribe([
        { topic: 'user' },
      ]);
      await handle.close();
    } finally {
      await secureClientWithDepositWallet.closeSubscriptions();
    }
  });

  it('closes routed subscription handles', async ({ publicClient }) => {
    const market = await findHighVolumeLowPriceMarket(publicClient);
    const tokenId = expectPresent(market.outcomes.yes.tokenId);

    const handle = await publicClient.subscribe([
      { tokenIds: [tokenId], topic: 'market' },
      { topic: 'sports' },
    ]);

    await handle.close();
    await publicClient.closeSubscriptions();

    await expect(handle[Symbol.asyncIterator]().next()).resolves.toMatchObject({
      done: true,
    });
  });

  describe('user subscriptions', () => {
    const userSubscriptionTokenId = expectPresent(
      userSubscriptionMarket.outcomes.yes.tokenId,
    );
    const userSubscriptionPrice = expectPresent(
      userSubscriptionMarket.trading.minimumTickSize,
    );
    const userSubscriptionSize = expectPresent(
      userSubscriptionMarket.trading.minimumOrderSize,
    );

    it('receives an order placement event after posting a resting limit order', async ({
      secureClientWithDepositWallet,
    }) => {
      const handle = await secureClientWithDepositWallet.subscribe([
        { topic: 'user' },
      ]);

      let orderId: string | undefined;

      try {
        const response = await secureClientWithDepositWallet.placeLimitOrder({
          postOnly: true,
          price: userSubscriptionPrice,
          side: OrderSide.BUY,
          size: userSubscriptionSize,
          tokenId: userSubscriptionTokenId,
        });
        const acceptedResponse = expectAcceptedOrderResponse(response);
        orderId = acceptedResponse.orderId;

        expect(acceptedResponse.status).toBe(OrderPostStatus.LIVE);

        const event = await waitForNextEvent(
          handle,
          (candidate) =>
            candidate.type === 'order' &&
            candidate.payload.id === orderId &&
            candidate.payload.orderEventType === UserOrderEventType.Placement,
          `order placement event arrived for ${orderId}`,
        );

        expect(event).toMatchObject({
          payload: {
            id: orderId,
            market: expect.any(String),
            orderEventType: UserOrderEventType.Placement,
            price: String(userSubscriptionPrice),
            side: OrderSide.BUY,
            tokenId: userSubscriptionTokenId,
          },
          topic: 'user',
          type: 'order',
        });
      } finally {
        if (orderId !== undefined) {
          await secureClientWithDepositWallet.cancelOrder({ orderId });
        }
        await secureClientWithDepositWallet.closeSubscriptions();
      }
    });

    it.runIf(runMeteredTests)(
      'receives a trade event for a broad subscription after posting a market order',
      async ({ secureClientWithDepositWallet }) => {
        const handle = await secureClientWithDepositWallet.subscribe([
          { topic: 'user' },
        ]);
        let boughtShares: string | undefined;

        try {
          const response = await secureClientWithDepositWallet.placeMarketOrder(
            {
              amount: userSubscriptionSize,
              side: OrderSide.BUY,
              tokenId: userSubscriptionTokenId,
            },
          );
          const acceptedResponse = expectAcceptedOrderResponse(response);
          boughtShares = acceptedResponse.takingAmount;

          const event = await waitForNextEvent(
            handle,
            (candidate) =>
              candidate.type === 'trade' &&
              candidate.payload.takerOrderId === acceptedResponse.orderId,
            `trade event arrived for ${acceptedResponse.orderId}`,
          );

          expect(event).toMatchObject({
            payload: {
              takerOrderId: acceptedResponse.orderId,
              tokenId: userSubscriptionTokenId,
            },
            topic: 'user',
            type: 'trade',
          });
        } finally {
          if (boughtShares !== undefined) {
            await closeBoughtPosition(
              secureClientWithDepositWallet,
              userSubscriptionTokenId,
              boughtShares,
            );
          }
          await secureClientWithDepositWallet.closeSubscriptions();
        }
      },
    );
  });
});

async function waitForNextEvent<TEvent extends { topic: string }>(
  handle: AsyncIterable<TEvent>,
  predicate?: (event: TEvent) => boolean,
  description = 'next event',
): Promise<TEvent> {
  const matches = predicate ?? (() => true);

  for await (const event of handle) {
    if (matches(event)) {
      return event;
    }
  }

  throw new Error(`User subscription closed before ${description}.`);
}

async function closeBoughtPosition(
  secureClient: SecureClient,
  tokenId: string,
  boughtShares: string,
): Promise<void> {
  if (Number(boughtShares) <= 0) {
    return;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await secureClient
        .placeMarketOrder({
          shares: boughtShares,
          side: OrderSide.SELL,
          tokenId,
        })
        .then(expectAcceptedOrderResponse);
      return;
    } catch (error) {
      if (attempt === 9) {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
