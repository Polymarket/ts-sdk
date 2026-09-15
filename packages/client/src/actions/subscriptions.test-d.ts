import { type PositionId, type TokenId, toTokenId } from '@polymarket/bindings';
import type * as BindingExports from '@polymarket/bindings/subscriptions';
import type {
  CryptoPriceEvent,
  CryptoPricesChainlinkTwapSixtyEvent,
  CryptoPricesChainlinkTwapThirtyEvent,
  CryptoTwapPriceEvent,
  CustomMarketEvent,
  EquityPriceEvent,
  MarketEvent,
  SportsEvent,
  StandardMarketEvent,
  UserEvent,
} from '@polymarket/bindings/subscriptions';
import { describe, expectTypeOf, it } from 'vitest';
import type {
  ConnectionLostError,
  RequestRejectedError,
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
  it('infers each price topic and only the requested mixed topics through the client', async () => {
    expectTypeOf<RootCryptoTwapPriceSubscription>().toEqualTypeOf<{
      topic: 'prices.crypto.twap';
      symbols: readonly string[];
    }>();
    expectTypeOf<RootCryptoTwapPriceEvent>().toEqualTypeOf<CryptoTwapPriceEvent>();
    const crypto = secureClient.subscribe([
      { topic: 'prices.crypto', symbols: ['btcusd'] },
    ]);
    expectTypeOf(crypto).resolves.toEqualTypeOf<
      SubscriptionHandle<CryptoPriceEvent>
    >();
    const twap = secureClient.subscribe([
      { topic: 'prices.crypto.twap', symbols: ['btcusd'] },
    ]);
    expectTypeOf(twap).resolves.toEqualTypeOf<
      SubscriptionHandle<CryptoTwapPriceEvent>
    >();
    const equity = secureClient.subscribe([
      { topic: 'prices.equity', symbol: 'aapl' },
    ]);
    expectTypeOf(equity).resolves.toEqualTypeOf<
      SubscriptionHandle<EquityPriceEvent>
    >();
    const mixed = secureClient.subscribe([
      { topic: 'prices.crypto.twap', symbols: ['btcusd'] },
      { topic: 'prices.equity', symbol: 'aapl' },
    ]);
    expectTypeOf(mixed).resolves.toEqualTypeOf<
      SubscriptionHandle<CryptoTwapPriceEvent | EquityPriceEvent>
    >();

    for await (const event of await twap) {
      if (event.type === 'subscribe') {
        expectTypeOf(event).toEqualTypeOf<
          Extract<CryptoTwapPriceEvent, { type: 'subscribe' }>
        >();
      } else {
        expectTypeOf(event).toEqualTypeOf<
          Extract<CryptoTwapPriceEvent, { type: 'update' }>
        >();
      }
    }
    for await (const event of await equity) {
      if (event.type === 'subscribe') {
        expectTypeOf(event).toEqualTypeOf<
          Extract<EquityPriceEvent, { type: 'subscribe' }>
        >();
      } else {
        expectTypeOf(event).toEqualTypeOf<
          Extract<EquityPriceEvent, { type: 'update' }>
        >();
      }
    }
  });

  it('requires authentication and explicit symbols while preserving deprecated topics', () => {
    const publicClient = createPublicClient();
    // @ts-expect-error Crypto prices require a secure client.
    publicClient.subscribe([{ topic: 'prices.crypto', symbols: ['btcusd'] }]);
    publicClient.subscribe([
      // @ts-expect-error TWAP prices require a secure client.
      { topic: 'prices.crypto.twap', symbols: ['btcusd'] },
    ]);
    // @ts-expect-error Equity prices require a secure client.
    publicClient.subscribe([{ topic: 'prices.equity', symbol: 'aapl' }]);
    // @ts-expect-error Crypto prices require explicit symbols.
    secureClient.subscribe([{ topic: 'prices.crypto' }]);
    // @ts-expect-error TWAP prices require explicit symbols.
    secureClient.subscribe([{ topic: 'prices.crypto.twap' }]);
    expectTypeOf<BindingExports.CommentsEvent>();
    expectTypeOf<ClientExports.CryptoPricesChainlinkTwapEvent>();
    // @ts-expect-error Managers are implementation details, not root exports.
    expectTypeOf<ClientExports.RealtimeWebSocketManager>();
    // @ts-expect-error Managers are implementation details, not root exports.
    expectTypeOf<ClientExports.RtdsWebSocketManager>();
    publicClient.subscribe([
      { topic: 'prices.crypto.binance', symbols: ['btcusdt'] },
      { topic: 'prices.crypto.chainlink', symbols: ['btc/usd'] },
      {
        topic: 'prices.crypto.chainlink.twap',
        symbols: ['btc/usd'],
        windowSeconds: 60,
      },
      { topic: 'prices.equity.pyth', symbol: 'aapl', types: ['update'] },
      { topic: 'comments' },
    ]);
  });

  it('preserves deprecated RTDS TWAP window narrowing', () => {
    type ThirtySecond = EventForSubscriptionSpecs<
      [
        {
          topic: 'prices.crypto.chainlink.twap';
          symbols: ['btc/usd'];
          windowSeconds: 30;
        },
      ]
    >;
    type SixtySecond = EventForSubscriptionSpecs<
      [
        {
          topic: 'prices.crypto.chainlink.twap';
          symbols: ['btc/usd'];
          windowSeconds: 60;
        },
      ]
    >;
    expectTypeOf<ThirtySecond>().toEqualTypeOf<CryptoPricesChainlinkTwapThirtyEvent>();
    expectTypeOf<SixtySecond>().toEqualTypeOf<CryptoPricesChainlinkTwapSixtyEvent>();
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
      | RequestRejectedError
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
