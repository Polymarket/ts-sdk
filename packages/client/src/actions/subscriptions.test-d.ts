import type {
  CryptoPricesBinanceEvent,
  CryptoPricesChainlinkEvent,
  CryptoPricesChainlinkTwapEvent,
  CryptoPricesChainlinkTwapSixtyEvent,
  CryptoPricesChainlinkTwapThirtyEvent,
  CustomMarketEvent,
  MarketEvent,
  SportsEvent,
  StandardMarketEvent,
  UserEvent,
} from '@polymarket/bindings/subscriptions';
import { describe, expectTypeOf, it } from 'vitest';
import type { TransportError, UserInputError } from '../errors';
import {
  createPublicClient,
  type CryptoPricesChainlinkTwapEvent as RootCryptoPricesChainlinkTwapEvent,
  type CryptoPricesChainlinkTwapSubscription as RootCryptoPricesChainlinkTwapSubscription,
  type CryptoPricesChainlinkTwapWindowSeconds as RootCryptoPricesChainlinkTwapWindowSeconds,
} from '../index';
import type {
  EquityPricesEvent,
  EventForSubscriptionSpecs,
  SubscribeError,
  SubscriptionHandle,
} from './subscriptions';

describe('EventForSubscriptionSpecs', () => {
  it('exports the TWAP public surface from the package root', () => {
    expectTypeOf<RootCryptoPricesChainlinkTwapSubscription>().toMatchTypeOf<{
      topic: 'prices.crypto.chainlink.twap';
      windowSeconds: 30 | 60;
    }>();
    expectTypeOf<RootCryptoPricesChainlinkTwapEvent>().toEqualTypeOf<CryptoPricesChainlinkTwapEvent>();
    expectTypeOf<RootCryptoPricesChainlinkTwapWindowSeconds>().toEqualTypeOf<
      30 | 60
    >();
  });

  it('narrows a standard market spec to standard market events', () => {
    type MarketOnly = EventForSubscriptionSpecs<
      readonly [{ topic: 'market'; tokenIds: readonly string[] }]
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
          tokenIds: readonly string[];
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
          tokenIds: readonly string[];
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
          tokenIds: readonly string[];
        },
      ]
    >;
    expectTypeOf<MarketOnly>().toEqualTypeOf<MarketEvent>();
  });

  it('narrows `prices.crypto.binance` to the Binance event type', () => {
    type BinanceOnly = EventForSubscriptionSpecs<
      readonly [{ topic: 'prices.crypto.binance' }]
    >;
    expectTypeOf<BinanceOnly>().toEqualTypeOf<CryptoPricesBinanceEvent>();
  });

  it('narrows `prices.crypto.chainlink` to the Chainlink event type', () => {
    type ChainlinkOnly = EventForSubscriptionSpecs<
      readonly [{ topic: 'prices.crypto.chainlink' }]
    >;
    expectTypeOf<ChainlinkOnly>().toEqualTypeOf<CryptoPricesChainlinkEvent>();
  });

  it('narrows each Chainlink TWAP window to its exact event type', () => {
    type ThirtySecondTwap = EventForSubscriptionSpecs<
      readonly [{ topic: 'prices.crypto.chainlink.twap'; windowSeconds: 30 }]
    >;
    type SixtySecondTwap = EventForSubscriptionSpecs<
      readonly [{ topic: 'prices.crypto.chainlink.twap'; windowSeconds: 60 }]
    >;

    expectTypeOf<ThirtySecondTwap>().toEqualTypeOf<CryptoPricesChainlinkTwapThirtyEvent>();
    expectTypeOf<SixtySecondTwap>().toEqualTypeOf<CryptoPricesChainlinkTwapSixtyEvent>();
  });

  it('keeps both TWAP event variants when the window is dynamic', () => {
    type DynamicTwap = EventForSubscriptionSpecs<
      readonly [
        {
          topic: 'prices.crypto.chainlink.twap';
          windowSeconds: 30 | 60;
        },
      ]
    >;

    expectTypeOf<DynamicTwap>().toEqualTypeOf<CryptoPricesChainlinkTwapEvent>();
  });

  it('unions exact events when subscribing to both TWAP windows', () => {
    type BothWindows = EventForSubscriptionSpecs<
      readonly [
        { topic: 'prices.crypto.chainlink.twap'; windowSeconds: 30 },
        { topic: 'prices.crypto.chainlink.twap'; windowSeconds: 60 },
      ]
    >;

    expectTypeOf<BothWindows>().toEqualTypeOf<
      CryptoPricesChainlinkTwapThirtyEvent | CryptoPricesChainlinkTwapSixtyEvent
    >();
  });

  it('unions spot and exact-window TWAP events', () => {
    type SpotAndTwap = EventForSubscriptionSpecs<
      readonly [
        { topic: 'prices.crypto.chainlink' },
        { topic: 'prices.crypto.chainlink.twap'; windowSeconds: 60 },
      ]
    >;

    expectTypeOf<SpotAndTwap>().toEqualTypeOf<
      CryptoPricesChainlinkEvent | CryptoPricesChainlinkTwapSixtyEvent
    >();
  });

  it('maps equity prices to the equity event union', () => {
    type EquityOnly = EventForSubscriptionSpecs<
      readonly [{ topic: 'prices.equity.pyth'; symbol: string }]
    >;
    expectTypeOf<EquityOnly>().toEqualTypeOf<EquityPricesEvent>();
  });

  it('unions the event types of a multi-topic spec', () => {
    type Mixed = EventForSubscriptionSpecs<
      readonly [
        { topic: 'market'; tokenIds: readonly string[] },
        { topic: 'sports' },
      ]
    >;
    expectTypeOf<Mixed>().toEqualTypeOf<StandardMarketEvent | SportsEvent>();
  });
});

describe('SubscribeError', () => {
  it('includes invalid input and transport failures', () => {
    expectTypeOf<SubscribeError>().toEqualTypeOf<
      UserInputError | TransportError
    >();
  });
});

describe('PublicClient.subscribe', () => {
  it('infers the event type from object-literal subscription specs', async () => {
    const client = createPublicClient();

    // Intentionally not awaited; we only care about the static type.
    const pending = client.subscribe([{ topic: 'market', tokenIds: ['123'] }]);
    expectTypeOf(pending).resolves.toEqualTypeOf<
      SubscriptionHandle<StandardMarketEvent>
    >();
  });

  it('infers custom-enabled market events from object-literal subscription specs', async () => {
    const client = createPublicClient();

    // Intentionally not awaited; we only care about the static type.
    const pending = client.subscribe([
      { customFeatureEnabled: true, topic: 'market', tokenIds: ['123'] },
    ]);
    expectTypeOf(pending).resolves.toEqualTypeOf<
      SubscriptionHandle<MarketEvent>
    >();
  });

  it('infers the exact TWAP event from the requested window', async () => {
    const client = createPublicClient();

    const pending = client.subscribe([
      {
        topic: 'prices.crypto.chainlink.twap',
        windowSeconds: 30,
        symbols: ['btc/usd'],
      },
    ]);
    expectTypeOf(pending).resolves.toEqualTypeOf<
      SubscriptionHandle<CryptoPricesChainlinkTwapThirtyEvent>
    >();
  });

  it('requires a supported TWAP window', () => {
    const client = createPublicClient();

    // @ts-expect-error TWAP subscriptions require an explicit window.
    client.subscribe([{ topic: 'prices.crypto.chainlink.twap' }]);
    client.subscribe([
      {
        topic: 'prices.crypto.chainlink.twap',
        // @ts-expect-error Only the published 30s and 60s feeds are supported.
        windowSeconds: 45,
      },
    ]);
  });

  it('excludes secure-only events from a public subscription', async () => {
    const client = createPublicClient();
    const pending = client.subscribe([{ topic: 'market', tokenIds: ['123'] }]);
    const handle = await pending;

    for await (const event of handle) {
      expectTypeOf(event).toEqualTypeOf<StandardMarketEvent>();
      expectTypeOf<Extract<typeof event, UserEvent>>().toEqualTypeOf<never>();
    }
  });
});
