import { describe, expect, it, vi } from 'vitest';
import { TransportError, UserInputError } from '../errors';
import { createPublicClient, PriceProvider, SubscribeError } from '../index';
import { subscriptionsFor } from '../websockets/realtime/protocol';
import { parsePriceSubscription } from './price-subscriptions';

describe('price subscription input', () => {
  describe.each([
    { topic: 'prices.crypto', symbols: ['btcusd'] },
    { topic: 'prices.crypto.twap', symbols: ['btcusd'] },
    { topic: 'prices.equity', symbol: 'nvda' },
    { topic: 'prices.equity.twap', symbol: 'UsDjPy' },
  ] as const)('$topic provider selection', (spec) => {
    it('keeps omitted, Pyth and Chainlink providers as distinct canonical keys', () => {
      const keys = [undefined, PriceProvider.Pyth, PriceProvider.Chainlink].map(
        (provider) => {
          const parsed = parsePriceSubscription({ ...spec, provider });
          expect(parsed.provider).toBe(provider);
          return subscriptionsFor(parsed)[0]?.key;
        },
      );
      expect(new Set(keys).size).toBe(3);
    });

    it.each([
      'massive',
      'future_provider',
      'PYTH',
      '',
      null,
      1,
    ])('rejects unsupported requested provider %s', (provider) => {
      expect(() =>
        parsePriceSubscription({ ...spec, provider } as never),
      ).toThrow(UserInputError);
    });
  });

  it.each([
    'prices.equity',
    'prices.equity.twap',
  ] as const)('keeps the %s acceptance callback next to the pin', (topic) => {
    const onSubscribed = vi.fn();
    const spec = parsePriceSubscription({
      topic,
      symbol: 'USDJPY',
      provider: PriceProvider.Pyth,
      onSubscribed,
    });
    expect(spec).toMatchObject({ provider: PriceProvider.Pyth, onSubscribed });
    expect(subscriptionsFor(spec)[0]).toMatchObject({
      provider: PriceProvider.Pyth,
      symbol: 'usdjpy',
    });
  });

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
