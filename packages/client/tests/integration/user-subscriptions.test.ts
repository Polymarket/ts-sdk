import { OrderSide } from '@polymarket/bindings';
import { OrderPostStatus } from '@polymarket/bindings/clob';
import type { Market, PublicClient } from '@polymarket/client';
import { expectPresent } from '@polymarket/types';
import { describe, expect, it } from './fixtures';
import { expectAcceptedOrderResponse } from './helpers';
import { findHighVolumeLowPriceMarket } from './markets';

let marketPromise: Promise<Market> | undefined;

type UserOrderEvent = {
  topic: 'user';
  type: 'order';
  payload: {
    id: string;
    market: string;
    orderEventType: string;
    price: string;
    side: string;
    tokenId: string;
  };
};

describe('User subscriptions', { timeout: 30_000 }, () => {
  it('receives an order placement event after posting a resting limit order', async ({
    publicClient,
    secureClientWithDepositWallet,
  }) => {
    const market = await findOrderMarket(publicClient);
    const tokenId = expectPresent(market.outcomes.yes.tokenId);
    const price = expectPresent(market.trading.minimumTickSize);
    const size = expectPresent(market.trading.minimumOrderSize);
    const handle = await secureClientWithDepositWallet.subscribe([
      { topic: 'user' },
    ]);

    let orderId: string | undefined;

    try {
      const response = await secureClientWithDepositWallet.placeLimitOrder({
        postOnly: true,
        price,
        side: OrderSide.BUY,
        size,
        tokenId,
      });
      const acceptedResponse = expectAcceptedOrderResponse(response);
      orderId = acceptedResponse.orderId;

      expect(acceptedResponse.status).toBe(OrderPostStatus.LIVE);

      const event = await waitForUserOrderPlacementEvent(handle, orderId);

      expect(event).toMatchObject({
        payload: {
          id: orderId,
          market: expect.any(String),
          orderEventType: 'PLACEMENT',
          price: String(price),
          side: OrderSide.BUY,
          tokenId,
        },
        topic: 'user',
        type: 'order',
      });
    } finally {
      if (orderId !== undefined) {
        await secureClientWithDepositWallet.cancelOrder({ orderId });
      }

      await handle.close();
      await secureClientWithDepositWallet.closeSubscriptions();
    }
  });
});

async function findOrderMarket(publicClient: PublicClient) {
  marketPromise ??= findHighVolumeLowPriceMarket(publicClient);

  return marketPromise;
}

async function waitForUserOrderPlacementEvent(
  handle: AsyncIterable<{ type: string; payload?: { id?: string } }>,
  orderId: string,
  timeoutMs = 15_000,
): Promise<UserOrderEvent> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      (async () => {
        for await (const event of handle) {
          if (event.type !== 'order' || event.payload?.id !== orderId) {
            continue;
          }

          const candidate = event as UserOrderEvent;

          if (candidate.payload.orderEventType === 'PLACEMENT') {
            return candidate;
          }
        }

        throw new Error(
          `User subscription closed before order placement event arrived for ${orderId}.`,
        );
      })(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(
              `Timed out waiting ${timeoutMs}ms for user order placement event ${orderId}.`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
