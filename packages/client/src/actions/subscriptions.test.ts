import { describe, expect, it, vi } from 'vitest';
import { TransportError, UserInputError } from '../errors';
import { createPublicClient, SubscribeError } from '../index';
import { subscriptionsFor } from '../websockets/realtime/protocol';
import { parsePriceSubscription } from './price-subscriptions';

describe('price subscription input', () => {
  it('canonicalizes an equity TWAP quote pair without imposing a USD suffix', () => {
    const spec = parsePriceSubscription({
      topic: 'prices.equity.twap',
      symbol: ' UsDjPy ',
    });
    expect(subscriptionsFor(spec)).toEqual([
      expect.objectContaining({
        topic: 'prices.equity.twap',
        symbol: 'usdjpy',
        windowSeconds: 60,
      }),
    ]);
    expect(subscriptionsFor(spec)).toEqual(
      subscriptionsFor({ topic: 'prices.equity.twap', symbol: 'usdjpy' }),
    );
  });

  it.each([
    { windowSeconds: 30 },
    { windowSeconds: 60 },
    { types: ['update'] },
    { symbols: ['usdjpy'] },
  ])('rejects unsupported equity TWAP options %o', (options) => {
    expect(() =>
      parsePriceSubscription({
        topic: 'prices.equity.twap',
        symbol: 'usdjpy',
        ...options,
      } as never),
    ).toThrow(UserInputError);
  });
});

describe('SubscribeError', () => {
  it('recognizes every documented subscription error', () => {
    expect(SubscribeError.isError(new UserInputError('invalid window'))).toBe(
      true,
    );
    expect(
      SubscribeError.isError(new TransportError('connection failed')),
    ).toBe(true);
    expect(SubscribeError.isError(new Error('unexpected'))).toBe(false);
  });
});

describe('PublicClient.subscribe', () => {
  it('validates a batch before opening any subscriptions', async () => {
    const client = createPublicClient();
    const subscribe = vi.spyOn(client.webSockets.clobMarket, 'subscribe');

    const error = await client
      .subscribe([
        { topic: 'market', assetIds: ['123'] },
        {
          topic: 'market',
          assetIds: ['123'],
          tokenIds: ['456'],
        } as never,
      ])
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(UserInputError);
    expect(error).toHaveProperty(
      'message',
      expect.stringContaining('Invalid input'),
    );
    expect(subscribe).not.toHaveBeenCalled();
  });
});
