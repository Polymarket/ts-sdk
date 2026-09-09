import { type PositionId, type TokenId, toTokenId } from '@polymarket/bindings';
import type * as BindingExports from '@polymarket/bindings/subscriptions';
import type {
  CryptoPriceEvent,
  CryptoTwapPriceEvent,
  CustomMarketEvent,
  EquityPriceEvent,
  MarketEvent,
  PolymarketPriceEvent,
  SportsEvent,
  StandardMarketEvent,
  UserEvent,
} from '@polymarket/bindings/subscriptions';
import { describe, expectTypeOf, it } from 'vitest';
import type {
  ConnectionLostError,
  SubscriptionRejectedError,
  TransportError,
  UserInputError,
} from '../errors';
import type * as ClientExports from '../index';
import {
  createPublicClient,
  type CryptoTwapPriceEvent as RootCryptoTwapPriceEvent,
  type CryptoTwapPriceSubscription as RootCryptoTwapPriceSubscription,
  type SecureClient,
} from '../index';

import type {
  EventForSubscriptionSpecs,
  MarketSubscription,
  SubscribeError,
  SubscriptionHandle,
} from './subscriptions';

declare const secureClient: SecureClient;

const ASSET_ID = toTokenId('123');

describe('price subscription contracts', () => {
  it('exports source-neutral prices and includes recent history', () => {
    expectTypeOf<RootCryptoTwapPriceSubscription>().toMatchTypeOf<{
      topic: 'prices.crypto.twap';
      symbols: readonly string[];
      windowSeconds: 30 | 60;
    }>();
    expectTypeOf<RootCryptoTwapPriceEvent>().toEqualTypeOf<CryptoTwapPriceEvent>();
    expectTypeOf<
      EventForSubscriptionSpecs<
        [{ topic: 'prices.crypto'; symbols: ['btcusd'] }]
      >
    >().toEqualTypeOf<CryptoPriceEvent>();
    expectTypeOf<
      EventForSubscriptionSpecs<
        [
          {
            topic: 'prices.crypto.twap';
            symbols: ['btc/usd'];
            windowSeconds: 60;
          },
        ]
      >
    >().toEqualTypeOf<CryptoTwapPriceEvent>();
    expectTypeOf<
      EventForSubscriptionSpecs<[{ topic: 'prices.equity'; symbol: 'aapl' }]>
    >().toEqualTypeOf<EquityPriceEvent>();
    expectTypeOf<
      EventForSubscriptionSpecs<
        [{ topic: 'prices.polymarket'; assetIds: ['1'] }]
      >
    >().toEqualTypeOf<PolymarketPriceEvent>();
    const pending = secureClient.subscribe([
      { topic: 'prices.crypto', symbols: ['btcusd'] },
    ]);
    expectTypeOf(pending).resolves.toEqualTypeOf<
      SubscriptionHandle<CryptoPriceEvent>
    >();
  });

  it('requires authentication and explicit filters, and removes the legacy surface', () => {
    const publicClient = createPublicClient();
    const crypto = { topic: 'prices.crypto', symbols: ['btcusd'] } as const;
    const twap = {
      topic: 'prices.crypto.twap',
      symbols: ['btcusd'],
      windowSeconds: 30,
    } as const;
    const equity = { topic: 'prices.equity', symbol: 'aapl' } as const;
    const bbo = { topic: 'prices.polymarket', assetIds: ['1'] } as const;
    // @ts-expect-error All price topics require a secure client.
    publicClient.subscribe([crypto]);
    // @ts-expect-error TWAP prices require a secure client.
    publicClient.subscribe([twap]);
    // @ts-expect-error Equity prices require a secure client.
    publicClient.subscribe([equity]);
    // @ts-expect-error BBO prices require a secure client.
    publicClient.subscribe([bbo]);
    // @ts-expect-error Price connections are not available on public clients.
    publicClient.webSockets.realtime;
    // @ts-expect-error The legacy manager property has been removed.
    secureClient.webSockets.rtds;
    // @ts-expect-error The legacy configuration key has been removed.
    secureClient.environment.rtds;
    // @ts-expect-error The legacy manager export has been removed.
    expectTypeOf<ClientExports.RtdsWebSocketManager>();
    // @ts-expect-error Legacy event exports have been removed.
    expectTypeOf<ClientExports.CryptoPricesChainlinkTwapEvent>();
    // @ts-expect-error Legacy comment event bindings have been removed.
    expectTypeOf<BindingExports.CommentsEvent>();
    const missingSymbols = { topic: 'prices.crypto' } as const;
    // @ts-expect-error Crypto prices require explicit symbols.
    secureClient.subscribe([missingSymbols]);
    const missingWindow = {
      topic: 'prices.crypto.twap',
      symbols: ['btcusd'],
    } as const;
    // @ts-expect-error TWAP prices require an explicit window.
    secureClient.subscribe([missingWindow]);
    const invalidWindow = { ...twap, windowSeconds: 45 } as const;
    // @ts-expect-error Only 30-second and 60-second windows are supported.
    secureClient.subscribe([invalidWindow]);
    const binance = { ...crypto, topic: 'prices.crypto.binance' } as const;
    // @ts-expect-error The source-named alias has been removed.
    secureClient.subscribe([binance]);
    const chainlinkTwap = {
      ...twap,
      topic: 'prices.crypto.chainlink.twap',
    } as const;
    // @ts-expect-error The source-named alias has been removed.
    secureClient.subscribe([chainlinkTwap]);
    const pyth = { ...equity, topic: 'prices.equity.pyth' } as const;
    // @ts-expect-error The source-named equity alias has been removed.
    secureClient.subscribe([pyth]);
    const chainlink = { ...crypto, topic: 'prices.crypto.chainlink' } as const;
    // @ts-expect-error The unsupported spot topic has been removed.
    secureClient.subscribe([chainlink]);
    // @ts-expect-error The comments stream has been removed.
    secureClient.subscribe([{ topic: 'comments' }]);
  });
});

describe('EventForSubscriptionSpecs', () => {
  it('narrows a standard market spec to standard market events', () => {
    type MarketOnly = EventForSubscriptionSpecs<
      readonly [
        {
          topic: 'market';
          assetIds: readonly (TokenId | PositionId)[];
        },
      ]
    >;
    expectTypeOf<MarketOnly>().toEqualTypeOf<StandardMarketEvent>();
    expectTypeOf<
      Extract<MarketOnly, CustomMarketEvent>
    >().toEqualTypeOf<never>();
  });

  it('narrows a custom-enabled market spec to all market events', () => {
    type MarketOnly = EventForSubscriptionSpecs<
      readonly [
        {
          customFeatureEnabled: true;
          topic: 'market';
          assetIds: readonly (TokenId | PositionId)[];
        },
      ]
    >;
    expectTypeOf<MarketOnly>().toEqualTypeOf<MarketEvent>();
  });

  it('narrows a custom-disabled market spec to standard market events', () => {
    type MarketOnly = EventForSubscriptionSpecs<
      readonly [
        {
          customFeatureEnabled: false;
          topic: 'market';
          assetIds: readonly (TokenId | PositionId)[];
        },
      ]
    >;
    expectTypeOf<MarketOnly>().toEqualTypeOf<StandardMarketEvent>();
  });

  it('keeps all market events when customFeatureEnabled is dynamic', () => {
    type MarketOnly = EventForSubscriptionSpecs<
      readonly [
        {
          customFeatureEnabled: boolean;
          topic: 'market';
          assetIds: readonly (TokenId | PositionId)[];
        },
      ]
    >;
    expectTypeOf<MarketOnly>().toEqualTypeOf<MarketEvent>();
  });

  it('unions the event types of a multi-topic spec', () => {
    type Mixed = EventForSubscriptionSpecs<
      readonly [
        {
          topic: 'market';
          assetIds: readonly (TokenId | PositionId)[];
        },
        { topic: 'sports' },
      ]
    >;
    expectTypeOf<Mixed>().toEqualTypeOf<StandardMarketEvent | SportsEvent>();
  });

  it('preserves event narrowing for a broad market spec in a mixed list', () => {
    type Mixed = EventForSubscriptionSpecs<
      readonly [MarketSubscription, { topic: 'sports' }]
    >;

    expectTypeOf<Mixed>().toEqualTypeOf<MarketEvent | SportsEvent>();
  });
});

describe('SubscribeError', () => {
  it('includes invalid input and transport failures', () => {
    expectTypeOf<SubscribeError>().toEqualTypeOf<
      | UserInputError
      | TransportError
      | ConnectionLostError
      | SubscriptionRejectedError
    >();
  });
});

describe('PublicClient.subscribe', () => {
  it('infers the event type from object-literal subscription specs', async () => {
    const client = createPublicClient();

    // Intentionally not awaited; we only care about the static type.
    const pending = client.subscribe([
      { topic: 'market', assetIds: [ASSET_ID] },
    ]);
    expectTypeOf(pending).resolves.toEqualTypeOf<
      SubscriptionHandle<StandardMarketEvent>
    >();
  });

  it('retains tokenIds as a compatibility subscription input', async () => {
    const client = createPublicClient();

    const pending = client.subscribe([{ topic: 'market', tokenIds: ['123'] }]);
    expectTypeOf(pending).resolves.toEqualTypeOf<
      SubscriptionHandle<StandardMarketEvent>
    >();
  });

  it('infers custom-enabled market events from object-literal subscription specs', async () => {
    const client = createPublicClient();

    // Intentionally not awaited; we only care about the static type.
    const pending = client.subscribe([
      { customFeatureEnabled: true, topic: 'market', assetIds: [ASSET_ID] },
    ]);
    expectTypeOf(pending).resolves.toEqualTypeOf<
      SubscriptionHandle<MarketEvent>
    >();
  });

  it('excludes secure-only events from a public subscription', async () => {
    const client = createPublicClient();
    const pending = client.subscribe([
      { topic: 'market', assetIds: [ASSET_ID] },
    ]);
    const handle = await pending;

    for await (const event of handle) {
      expectTypeOf(event).toEqualTypeOf<StandardMarketEvent>();
      expectTypeOf<Extract<typeof event, UserEvent>>().toEqualTypeOf<never>();
    }
  });
});
