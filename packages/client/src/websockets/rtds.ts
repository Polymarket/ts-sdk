import {
  type CommentsEvent,
  type CryptoPricesChainlinkTwapWindowSeconds,
  type CryptoPricesEvent,
  type EquityPricesEvent,
  RealtimeEventSchema,
} from '@polymarket/bindings/subscriptions';
import { invariant } from '@polymarket/types';
import type {
  CommentsSubscription,
  CryptoPricesChainlinkTwapSubscription,
  CryptoPricesSubscription,
  EquityPricesSubscription,
  SubscriptionHandle,
} from '../actions/subscriptions';
import { createSubscriptionHandle } from './handle';
import { RtdsWebSocketHeartbeat } from './heartbeat';
import {
  ReconnectScheduler,
  WebSocketConnection,
  type WebSocketConnectionResult,
} from './lifecycle';
import {
  SubscriptionRegistry,
  type SubscriptionRegistryChange,
  type SubscriptionRegistryEntry,
} from './registry';
import type { WebSocketSubscriptionManager } from './types';

type RtdsSpec =
  | CommentsSubscription
  | CryptoPricesSubscription
  | CryptoPricesChainlinkTwapSubscription
  | EquityPricesSubscription;

type RtdsEvent = CommentsEvent | CryptoPricesEvent | EquityPricesEvent;

type RtdsSubscriptionEntry = SubscriptionRegistryEntry<RtdsSpec, RtdsEvent>;

type RtdsServerSubscription = {
  key: string;
  topic: string;
  type: string;
};

type RtdsServerState = Map<string, RtdsServerSubscription>;

export type RtdsWebSocketManagerOptions = {
  headers?: Record<string, string>;
  url: string;
};

/**
 * Realtime Data Service (RTDS) WebSocket manager.
 *
 * Implements {@link WebSocketSubscriptionManager} for the comments, crypto prices, and
 * equity prices topics multiplexed over a single shared upstream socket
 * opened lazily on the first subscribe.
 */
export class RtdsWebSocketManager
  implements WebSocketSubscriptionManager<RtdsSpec, RtdsEvent>
{
  readonly #headers: Record<string, string> | undefined;
  readonly #url: string;
  #closing: Promise<void> | undefined;
  readonly #connection = new WebSocketConnection({
    heartbeat: new RtdsWebSocketHeartbeat(),
  });
  readonly #reconnectScheduler = new ReconnectScheduler();
  readonly #subscriptions = new SubscriptionRegistry<
    RtdsSpec,
    RtdsEvent,
    RtdsServerState
  >({ deriveServerState: deriveRtdsServerState });

  constructor(options: RtdsWebSocketManagerOptions) {
    this.#headers = options.headers;
    this.#url = options.url;
  }

  async subscribe(
    subscription: RtdsSpec,
  ): Promise<SubscriptionHandle<RtdsEvent>> {
    const { change, entry } = this.#subscriptions.add(subscription, {
      matches: matcherFor(subscription),
    });
    await this.#registerSubscriber(entry, change);
    return createSubscriptionHandle(entry.subscriber.queue, () =>
      this.#closeSubscriber(entry),
    );
  }

  // Subscription handle lifecycle.

  async #registerSubscriber(
    entry: RtdsSubscriptionEntry,
    change: SubscriptionRegistryChange<RtdsServerState>,
  ): Promise<void> {
    try {
      const connection = await this.#connect();
      if (connection.reusedOpenSocket) {
        const { before, after } = change;
        const subscriptionsToOpen = serverSubscriptionsAdded(before, after);
        this.#sendSubscribeFrame(subscriptionsToOpen);
      }
    } catch (error) {
      await this.#closeSubscriber(entry);
      throw error;
    }
  }

  async #closeSubscriber(entry: RtdsSubscriptionEntry): Promise<void> {
    const { before, after } = this.#subscriptions.remove(entry);
    const subscriptionsToClose = serverSubscriptionsRemoved(before, after);
    this.#sendUnsubscribeFrame(subscriptionsToClose);
    if (!this.#subscriptions.hasActiveSubscriptions()) {
      await this.close();
    }
  }

  // Socket lifecycle.

  async close(): Promise<void> {
    if (this.#closing === undefined) {
      this.#closing = this.#shutdown().finally(() => {
        this.#closing = undefined;
      });
    }
    await this.#closing;
  }

  async #shutdown(): Promise<void> {
    this.#reconnectScheduler.stop();
    this.#subscriptions.endAll();

    await this.#connection.close();
  }

  #connect(): Promise<WebSocketConnectionResult> {
    return this.#connection.connect({
      onConnectionLost: () => this.#onConnectionLost(),
      onError: () => this.#onConnectionError(),
      onMessage: (message) => this.#onConnectionMessage(message),
      onOpen: () => this.#onConnectionOpen(),
      headers: this.#headers,
      url: this.#url,
    });
  }

  #onConnectionOpen(): void {
    this.#reconnectScheduler.resetBackoff();
    this.#resubscribeActiveServerEntries();
  }

  #onConnectionMessage(message: unknown): void {
    const parsed = RealtimeEventSchema.safeParse(message);
    if (!parsed.success) return;
    this.#subscriptions.dispatch(parsed.data);
  }

  #onConnectionLost(): void {
    if (this.#subscriptions.hasActiveSubscriptions()) {
      this.#scheduleReconnect();
    }
  }

  #onConnectionError(): void {
    // Browser WebSockets report most failures as an error followed by close.
    // Keep iterators alive here so the close path can reconnect active handles.
  }

  // RTDS subscribe/unsubscribe frames.

  #resubscribeActiveServerEntries(): void {
    this.#sendSubscribeFrame(
      Array.from(this.#subscriptions.serverState().values()),
    );
  }

  #sendSubscribeFrame(subscriptions: readonly RtdsServerSubscription[]): void {
    if (subscriptions.length === 0) return;
    this.#connection.send(buildSubscribeMessage(subscriptions));
  }

  #sendUnsubscribeFrame(
    subscriptions: readonly RtdsServerSubscription[],
  ): void {
    if (subscriptions.length === 0) return;
    this.#connection.send(buildUnsubscribeMessage(subscriptions));
  }

  #scheduleReconnect(): void {
    this.#reconnectScheduler.schedule({
      reconnect: () => this.#connect(),
      shouldReconnect: () => this.#subscriptions.hasActiveSubscriptions(),
    });
  }
}

function serverSubscriptionsAdded(
  before: ReadonlyMap<string, RtdsServerSubscription>,
  after: ReadonlyMap<string, RtdsServerSubscription>,
): RtdsServerSubscription[] {
  return Array.from(after).flatMap(([key, subscription]) =>
    before.has(key) ? [] : [subscription],
  );
}

function serverSubscriptionsRemoved(
  before: ReadonlyMap<string, RtdsServerSubscription>,
  after: ReadonlyMap<string, RtdsServerSubscription>,
): RtdsServerSubscription[] {
  return Array.from(before).flatMap(([key, subscription]) =>
    after.has(key) ? [] : [subscription],
  );
}

function deriveRtdsServerState(
  entries: Iterable<RtdsSubscriptionEntry>,
): RtdsServerState {
  const activeByKey = new Map<string, RtdsServerSubscription>();
  for (const { subscription } of entries) {
    for (const serverSubscription of serverSubscriptionsFor(subscription)) {
      if (!activeByKey.has(serverSubscription.key)) {
        activeByKey.set(serverSubscription.key, serverSubscription);
      }
    }
  }
  return activeByKey;
}

function buildSubscribeMessage(
  subscriptions: readonly RtdsServerSubscription[],
): unknown {
  return {
    action: 'subscribe',
    subscriptions: subscriptions.map(({ topic, type }) => ({ topic, type })),
  };
}

function buildUnsubscribeMessage(
  subscriptions: readonly RtdsServerSubscription[],
): unknown {
  return {
    action: 'unsubscribe',
    subscriptions: subscriptions.map(({ topic, type }) => ({ topic, type })),
  };
}

function serverSubscriptionsFor(
  subscription: RtdsSpec,
): RtdsServerSubscription[] {
  switch (subscription.topic) {
    case 'comments':
      // RTDS tracks subscription state per (topic, type): different comment
      // event types coexist independently on the same socket, so one entry
      // per requested type. No server-side filters — any narrowing by
      // parentEntityID/parentEntityType happens client-side via matcherFor.
      return (subscription.types ?? ['comment_created']).map((type) =>
        serverSubscription('comments', type),
      );
    case 'prices.crypto.binance':
      // Subscribe broadly and filter client-side. Sending a second subscribe
      // frame with a different `filters` value on the same socket causes the
      // server to replace the prior subscription rather than add one, so
      // multiple subscribers on the same manager cannot share a socket while
      // using server-side filters. See docs/api-boundary-notes.md.
      return [serverSubscription('crypto_prices', 'update')];
    case 'prices.crypto.chainlink':
      // RTDS tracks one filter per topic per connection, so a second subscribe
      // with a different filter replaces the first. Subscribe broadly and
      // filter client-side — see docs/api-boundary-notes.md.
      return [serverSubscription('crypto_prices_chainlink', 'update')];
    case 'prices.crypto.chainlink.twap':
      // Each TWAP window is a distinct RTDS topic. Subscribe broadly within
      // the requested window and narrow symbols client-side so subscribers for
      // the same window can safely share a socket.
      return [
        serverSubscription(
          twapServerTopic(subscription.windowSeconds),
          'update',
        ),
      ];
    case 'prices.equity.pyth':
      // Same per-topic replace-on-resubscribe constraint as crypto_prices. A
      // single unfiltered subscribe covers every active equity symbol; the
      // client-side matcher narrows to the caller's requested symbol.
      return [serverSubscription('equity_prices', 'update')];
    default: {
      const neverSpec: never = subscription;
      invariant(false, `Unknown RTDS topic: ${String(neverSpec)}`);
    }
  }
}

function twapServerTopic(
  windowSeconds: CryptoPricesChainlinkTwapWindowSeconds,
): string {
  switch (windowSeconds) {
    case 30:
      return 'crypto_prices_twap_thirty';
    case 60:
      return 'crypto_prices_twap_sixty';
    default: {
      const neverWindow: never = windowSeconds;
      invariant(false, `Unknown TWAP window: ${String(neverWindow)}`);
    }
  }
}

function serverSubscription(
  topic: string,
  type: string,
): RtdsServerSubscription {
  return {
    key: `${topic}:${type}`,
    topic,
    type,
  };
}

function matcherFor(subscription: RtdsSpec): (event: RtdsEvent) => boolean {
  switch (subscription.topic) {
    case 'comments':
      // All `comments` narrowing happens client-side because the RTDS server
      // uses opaque substring matching on `filters` rather than structured
      // fields. When the caller sets `parentEntityId` or `parentEntityType`,
      // reaction events are dropped: their payloads carry only `commentID`,
      // not the parent context, so we can't verify the filter on them. Rule:
      // if a filter can't be verified on an event, the event doesn't match.
      // See docs/api-boundary-notes.md.
      return (event) => {
        if (event.topic !== 'comments') return false;
        if (
          subscription.types !== undefined &&
          subscription.types.length > 0 &&
          !subscription.types.includes(event.type)
        ) {
          return false;
        }
        const hasParentFilter =
          subscription.parentEntityId !== undefined ||
          subscription.parentEntityType !== undefined;
        if (hasParentFilter) {
          const carriesParentContext =
            event.type === 'comment_created' ||
            event.type === 'comment_removed';
          if (!carriesParentContext) return false;
          if (
            subscription.parentEntityId !== undefined &&
            event.payload.parentEntityID !== subscription.parentEntityId
          ) {
            return false;
          }
          if (
            subscription.parentEntityType !== undefined &&
            event.payload.parentEntityType !== subscription.parentEntityType
          ) {
            return false;
          }
        }
        return true;
      };
    case 'prices.crypto.binance':
      return (event) =>
        event.topic === 'prices.crypto.binance' &&
        (subscription.symbols === undefined ||
          subscription.symbols.length === 0 ||
          subscription.symbols.includes(event.payload.symbol));
    case 'prices.crypto.chainlink':
      return (event) =>
        event.topic === 'prices.crypto.chainlink' &&
        (subscription.symbols === undefined ||
          subscription.symbols.length === 0 ||
          subscription.symbols.includes(event.payload.symbol));
    case 'prices.crypto.chainlink.twap':
      return (event) =>
        event.topic === 'prices.crypto.chainlink.twap' &&
        event.payload.windowSeconds === subscription.windowSeconds &&
        (subscription.symbols === undefined ||
          subscription.symbols.length === 0 ||
          subscription.symbols.includes(event.payload.symbol));
    case 'prices.equity.pyth':
      // RTDS emits every event kind for a topic regardless of the `type` value
      // in the subscribe frame, so the caller's `types` filter must be
      // enforced client-side here.
      return (event) =>
        event.topic === 'prices.equity.pyth' &&
        event.payload.symbol.toLowerCase() ===
          subscription.symbol.toLowerCase() &&
        (subscription.types === undefined ||
          subscription.types.length === 0 ||
          subscription.types.includes(event.type));
    default: {
      const neverSpec: never = subscription;
      invariant(false, `Unknown RTDS topic: ${String(neverSpec)}`);
    }
  }
}
