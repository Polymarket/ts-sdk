import type { PerpsKlineInterval } from '@polymarket/bindings/perps';
import type {
  CryptoPriceEvent,
  CryptoTwapPriceEvent,
  CustomMarketEvent,
  EquityPriceEvent,
  MarketEvent,
  PerpsBboEvent,
  PerpsBookEvent,
  PerpsCandleEvent,
  PerpsMarketDataEvent,
  PerpsStatisticEvent,
  PerpsTickerEvent,
  PerpsTradeEvent,
  PolymarketPriceEvent,
  SportsEvent,
  StandardMarketEvent,
  UserEvent,
} from '@polymarket/bindings/subscriptions';
import { invariant, type Prettify } from '@polymarket/types';
import merge from 'it-merge';
import { z } from 'zod';
import type {
  BaseClient,
  BasePublicClient,
  BaseSecureClient,
} from '../clients';
import {
  ConnectionLostError,
  makeErrorGuard,
  SubscriptionRejectedError,
  TransportError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import { parsePriceSubscription } from './price-subscriptions';

export type {
  CryptoPriceEvent,
  CryptoPriceSnapshotEvent,
  CryptoTwapPriceEvent,
  CryptoTwapPriceSnapshotEvent,
  EquityPriceEvent,
  PolymarketPriceEvent,
} from '@polymarket/bindings/subscriptions';

// Event types — re-exported from bindings for consumer convenience.
export type {
  CustomMarketEvent,
  MarketEvent,
  PerpsBboEvent,
  PerpsBookEvent,
  PerpsCandleEvent,
  PerpsMarketDataEvent,
  PerpsStatisticEvent,
  PerpsTickerEvent,
  PerpsTradeEvent,
  SportsEvent,
  StandardMarketEvent,
  UserEvent,
};

// Event `type` discriminants derived from bindings events.
export type MarketEventType = MarketEvent['type'];
export type UserEventType = UserEvent['type'];
export type SportsEventType = SportsEvent['type'];
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsMarketDataEventType = PerpsMarketDataEvent['type'];

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsStreamingCandleInterval = Exclude<
  PerpsKlineInterval,
  PerpsKlineInterval.OneSecond
>;

type PerpsInstrumentIdInput = number;

// Subscription specs.
export type MarketSubscription =
  | {
      topic: 'market';
      /** Asset identifiers whose market events should be delivered. */
      assetIds: readonly string[];
      tokenIds?: never;

      /**
       * When `true`, the server additionally emits `MarketBestBidAskEvent`,
       * `NewMarketEvent`, and `MarketResolvedEvent`.
       */
      customFeatureEnabled?: boolean;
    }
  | {
      topic: 'market';
      assetIds?: never;
      /** @deprecated Use `assetIds`. */
      tokenIds: readonly string[];

      /**
       * When `true`, the server additionally emits `MarketBestBidAskEvent`,
       * `NewMarketEvent`, and `MarketResolvedEvent`.
       */
      customFeatureEnabled?: boolean;
    };

export type UserSubscription = {
  topic: 'user';
  markets?: readonly string[];
};

export type SportsSubscription = {
  topic: 'sports';
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsTradesSubscription = {
  topic: 'perps.trades';
  instrumentId: PerpsInstrumentIdInput;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsBboSubscription = {
  topic: 'perps.bbo';
  instrumentId: PerpsInstrumentIdInput;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsBookSubscription = {
  topic: 'perps.book';
  instrumentId: PerpsInstrumentIdInput;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsCandlesSubscription = {
  topic: 'perps.candles';
  instrumentId: PerpsInstrumentIdInput;
  interval: PerpsStreamingCandleInterval;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsTickersSubscription = {
  topic: 'perps.tickers';
  instrumentId?: PerpsInstrumentIdInput;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsStatisticsSubscription = {
  topic: 'perps.statistics';
  instrumentId?: PerpsInstrumentIdInput;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsMarketDataSubscription =
  | PerpsTradesSubscription
  | PerpsBboSubscription
  | PerpsBookSubscription
  | PerpsCandlesSubscription
  | PerpsTickersSubscription
  | PerpsStatisticsSubscription;

export type PublicSubscriptionSpec =
  | MarketSubscription
  | SportsSubscription
  | PerpsMarketDataSubscription;

/** Symbol-filtered cryptocurrency updates and recent history. Requires a secure client. */
export type CryptoPriceSubscription = {
  topic: 'prices.crypto';
  symbols: readonly string[];
};
/** Time-weighted prices and recent history. Requires a secure client. */
export type CryptoTwapPriceSubscription = {
  topic: 'prices.crypto.twap';
  symbols: readonly string[];
  windowSeconds: 30 | 60;
};
/** Equity updates and recent history. Requires a secure client. */
export type EquityPriceSubscription = {
  topic: 'prices.equity';
  symbol: string;
  types?: readonly ('subscribe' | 'update')[];
};
/** Best bid and offer updates. Requires a secure client. */
export type PolymarketPriceSubscription = {
  topic: 'prices.polymarket';
  assetIds: readonly string[];
};
export type PriceSubscription =
  | CryptoPriceSubscription
  | CryptoTwapPriceSubscription
  | EquityPriceSubscription
  | PolymarketPriceSubscription;
export type SecureSubscriptionSpec =
  | PublicSubscriptionSpec
  | UserSubscription
  | PriceSubscription;

// Event unions, aligned with subscription specs.
export type PublicRealtimeEvent =
  | MarketEvent
  | SportsEvent
  | PerpsMarketDataEvent;

export type SecureRealtimeEvent =
  | PublicRealtimeEvent
  | UserEvent
  | CryptoPriceEvent
  | CryptoTwapPriceEvent
  | EquityPriceEvent
  | PolymarketPriceEvent;

// Topics derived from event unions so bindings remain the single source of
// truth for topic literals.
export type PublicRealtimeTopic = Prettify<PublicRealtimeEvent['topic']>;
export type SecureRealtimeTopic = Prettify<SecureRealtimeEvent['topic']>;

// Spec-to-event mapping keyed by the shared `topic` discriminant. Each simple
// topic resolves to a named event type so hover shows the alias rather than an
// expanded structural shape. Market subscriptions are handled separately
// because `customFeatureEnabled` contributes to the event union.
//
// Relies on `subscribe` declaring `TSubscriptions` with the `const` modifier
// so that literal topics survive inference from object literals.
type EventByTopic = {
  'prices.crypto': CryptoPriceEvent;
  'prices.crypto.twap': CryptoTwapPriceEvent;
  'prices.equity': EquityPriceEvent;
  'prices.polymarket': PolymarketPriceEvent;
  user: UserEvent;
  sports: SportsEvent;
  'perps.trades': PerpsTradeEvent;
  'perps.bbo': PerpsBboEvent;
  'perps.book': PerpsBookEvent;
  'perps.candles': PerpsCandleEvent;
  'perps.tickers': PerpsTickerEvent;
  'perps.statistics': PerpsStatisticEvent;
};

type EventForMarketSubscription<TSpec extends MarketSubscription> =
  'customFeatureEnabled' extends keyof TSpec
    ? true extends TSpec['customFeatureEnabled']
      ? MarketEvent
      : StandardMarketEvent
    : StandardMarketEvent;

export type EventForSubscriptionSpec<TSpec extends SecureSubscriptionSpec> =
  TSpec extends MarketSubscription
    ? EventForMarketSubscription<TSpec>
    : TSpec extends { topic: infer TTopic extends keyof EventByTopic }
      ? EventByTopic[TTopic]
      : never;

export type EventForSubscriptionSpecs<
  TSubscriptions extends readonly SecureSubscriptionSpec[],
> = EventForSubscriptionSpec<TSubscriptions[number]>;

export type SubscriptionHandle<TEvent> = {
  /**
   * Closes the subscription. Idempotent: subsequent calls resolve without
   * effect. Best-effort — errors from the first call propagate, later calls
   * are no-ops.
   */
  close(): Promise<void>;
} & AsyncIterable<TEvent>;

export type SubscribeError =
  | TransportError
  | UserInputError
  | SubscriptionRejectedError
  | ConnectionLostError;
export const SubscribeError = makeErrorGuard(
  TransportError,
  UserInputError,
  SubscriptionRejectedError,
  ConnectionLostError,
);

enum SubscriptionTopic {
  Market = 'market',
  User = 'user',
  Sports = 'sports',
  Crypto = 'prices.crypto',
  Twap = 'prices.crypto.twap',
  Equity = 'prices.equity',
  Polymarket = 'prices.polymarket',
  PerpsTrades = 'perps.trades',
  PerpsBbo = 'perps.bbo',
  PerpsBook = 'perps.book',
  PerpsCandles = 'perps.candles',
  PerpsTickers = 'perps.tickers',
  PerpsStatistics = 'perps.statistics',
}
const SubscriptionTopicSchema = z.object({ topic: z.enum(SubscriptionTopic) });

const MarketSubscriptionSchema = z.union([
  z.object({
    topic: z.literal('market'),
    assetIds: z.array(z.string()),
    tokenIds: z.never().optional(),
    customFeatureEnabled: z.boolean().optional(),
  }),
  z.object({
    topic: z.literal('market'),
    assetIds: z.never().optional(),
    tokenIds: z.array(z.string()),
    customFeatureEnabled: z.boolean().optional(),
  }),
]);

/**
 * Starts one or more realtime subscriptions on this client.
 *
 * Price subscriptions require a secure client and explicit filters. Vendor
 * price streams include recent-history snapshots as well as live updates.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link SubscribeError}
 * Thrown when subscription input is invalid or a realtime subscription fails.
 *
 * @example
 * ```ts
 * const handle = await client.subscribe([
 *   { topic: 'market', assetIds: ['123'] },
 * ]);
 *
 * for await (const event of handle) {
 *   // event: StandardMarketEvent
 * }
 * ```
 */
export async function subscribe<
  const TSubscriptions extends readonly PublicSubscriptionSpec[],
>(
  client: BasePublicClient,
  subscriptions: TSubscriptions,
): Promise<SubscriptionHandle<EventForSubscriptionSpecs<TSubscriptions>>>;
export async function subscribe<
  const TSubscriptions extends readonly SecureSubscriptionSpec[],
>(
  client: BaseSecureClient,
  subscriptions: TSubscriptions,
): Promise<SubscriptionHandle<EventForSubscriptionSpecs<TSubscriptions>>>;
export async function subscribe(
  client: BaseClient,
  subscriptions: readonly SecureSubscriptionSpec[],
): Promise<SubscriptionHandle<unknown>> {
  const validatedSubscriptions = subscriptions.map((subscription) => {
    parseUserInput(subscription, SubscriptionTopicSchema);
    switch (subscription.topic) {
      case 'prices.crypto':
      case 'prices.crypto.twap':
      case 'prices.equity':
      case 'prices.polymarket':
        if (!client.isSecureClient())
          throw new UserInputError(
            'This subscription requires a secure client.',
          );
        return parsePriceSubscription(subscription);
      case 'market':
        parseUserInput(subscription, MarketSubscriptionSchema);
        break;
    }
    return subscription;
  });

  const results = await Promise.allSettled(
    validatedSubscriptions.map(async (spec) => subscribeOne(client, spec)),
  );
  const handles = results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') {
    await Promise.allSettled(handles.map((handle) => handle.close()));
    throw failure.reason;
  }
  return mergedSubscription(handles);
}

function subscribeOne(
  client: BaseClient,
  spec: SecureSubscriptionSpec,
): Promise<SubscriptionHandle<unknown>> {
  switch (spec.topic) {
    case 'market':
      return client.webSockets.clobMarket.subscribe(spec);
    case 'sports':
      return client.webSockets.sports.subscribe(spec);
    case 'prices.crypto':
    case 'prices.crypto.twap':
    case 'prices.equity':
    case 'prices.polymarket':
      if (!client.isSecureClient())
        throw new UserInputError('This subscription requires a secure client.');
      return client.webSockets.realtime.subscribe(spec);
    case 'perps.trades':
    case 'perps.bbo':
    case 'perps.book':
    case 'perps.candles':
    case 'perps.tickers':
    case 'perps.statistics':
      return client.webSockets.perpsSubscriptions.subscribe(spec);
    case 'user':
      invariant(
        client.isSecureClient(),
        "A 'user' subscription requires a secure client instance.",
      );
      return client.webSockets.clobUser.subscribe(spec);
  }
}

function mergedSubscription<TEvent>(
  children: readonly SubscriptionHandle<TEvent>[],
): SubscriptionHandle<TEvent> {
  // Cache the in-flight or settled close so subsequent `close()` calls are
  // idempotent: concurrent callers share the same underlying teardown, and
  // callers after settlement observe the original result (including any
  // rejection) instead of re-invoking child teardowns.
  let closing: Promise<void> | undefined;

  async function close(): Promise<void> {
    if (closing === undefined) {
      closing = Promise.all(children.map((child) => child.close())).then(
        () => undefined,
      );
    }
    await closing;
  }

  const iterable = merge(...children);

  return {
    close,
    [Symbol.asyncIterator]() {
      return iterable[Symbol.asyncIterator]();
    },
  };
}
