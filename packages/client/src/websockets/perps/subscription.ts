import {
  type PerpsMarketDataEvent,
  PerpsMarketDataEventSchema,
} from '@polymarket/bindings/subscriptions';
import { invariant } from '@polymarket/types';
import type {
  PerpsMarketDataSubscription,
  SubscriptionHandle,
} from '../../actions/subscriptions';
import { createSubscriptionHandle } from '../handle';
import { PerpsWebSocketHeartbeat } from '../heartbeat';
import {
  ReconnectScheduler,
  WebSocketConnection,
  type WebSocketConnectionResult,
} from '../lifecycle';
import {
  SubscriptionRegistry,
  type SubscriptionRegistryChange,
  type SubscriptionRegistryEntry,
} from '../registry';
import type { WebSocketSubscriptionManager } from '../types';

type PerpsSubscriptionEntry = SubscriptionRegistryEntry<
  PerpsMarketDataSubscription,
  PerpsMarketDataEvent
>;

type PerpsSubscriptionServerState = Set<string>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsSubscriptionManagerOptions = {
  headers?: Record<string, string>;
  url: string;
};

/**
 * Perps public subscription WebSocket manager.
 *
 * The Perps server tracks subscriptions by channel string. This manager keeps
 * SDK-level topic specs separate from upstream channel names and resubscribes
 * active channels after reconnects.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export class PerpsSubscriptionManager
  implements
    WebSocketSubscriptionManager<
      PerpsMarketDataSubscription,
      PerpsMarketDataEvent
    >
{
  readonly #headers: Record<string, string> | undefined;
  readonly #url: string;
  #closing: Promise<void> | undefined;
  #nextRequestId = 1;
  readonly #connection = new WebSocketConnection({
    heartbeat: new PerpsWebSocketHeartbeat(),
  });
  readonly #reconnectScheduler = new ReconnectScheduler();
  readonly #subscriptions = new SubscriptionRegistry<
    PerpsMarketDataSubscription,
    PerpsMarketDataEvent,
    PerpsSubscriptionServerState
  >({ deriveServerState: derivePerpsSubscriptionServerState });

  /**
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  constructor(options: PerpsSubscriptionManagerOptions) {
    this.#headers = options.headers;
    this.#url = options.url;
  }

  /**
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async subscribe(
    subscription: PerpsMarketDataSubscription,
  ): Promise<SubscriptionHandle<PerpsMarketDataEvent>> {
    const { change, entry } = this.#subscriptions.add(subscription, {
      matches: matcherFor(subscription),
    });
    await this.#registerSubscriber(entry, change);
    return createSubscriptionHandle(entry.subscriber.queue, () =>
      this.#closeSubscriber(entry),
    );
  }

  async #registerSubscriber(
    entry: PerpsSubscriptionEntry,
    change: SubscriptionRegistryChange<PerpsSubscriptionServerState>,
  ): Promise<void> {
    try {
      const connection = await this.#connect();
      if (connection.reusedOpenSocket) {
        this.#sendSubscribeFrame(channelsAdded(change.before, change.after));
        this.#sendUnsubscribeFrame(
          channelsRemoved(change.before, change.after),
        );
      }
    } catch (error) {
      await this.#closeSubscriber(entry);
      throw error;
    }
  }

  async #closeSubscriber(entry: PerpsSubscriptionEntry): Promise<void> {
    const { before, after } = this.#subscriptions.remove(entry);
    this.#sendSubscribeFrame(channelsAdded(before, after));
    this.#sendUnsubscribeFrame(channelsRemoved(before, after));
    if (!this.#subscriptions.hasActiveSubscriptions()) {
      await this.close();
    }
  }

  /**
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
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
    this.#sendSubscribeFrame(Array.from(this.#subscriptions.serverState()));
  }

  #onConnectionMessage(message: unknown): void {
    const parsed = PerpsMarketDataEventSchema.safeParse(message);
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

  #sendSubscribeFrame(channels: readonly string[]): void {
    if (channels.length === 0) return;
    this.#connection.send(this.#buildChannelFrame('sub', channels));
  }

  #sendUnsubscribeFrame(channels: readonly string[]): void {
    if (channels.length === 0) return;
    this.#connection.send(this.#buildChannelFrame('unsub', channels));
  }

  #buildChannelFrame(req: 'sub' | 'unsub', channels: readonly string[]) {
    return {
      id: this.#nextRequestId++,
      req,
      chs: channels,
    };
  }

  #scheduleReconnect(): void {
    this.#reconnectScheduler.schedule({
      reconnect: () => this.#connect(),
      shouldReconnect: () => this.#subscriptions.hasActiveSubscriptions(),
    });
  }
}

function derivePerpsSubscriptionServerState(
  entries: Iterable<PerpsSubscriptionEntry>,
): PerpsSubscriptionServerState {
  const channels = new Set<string>();
  const tickerInstrumentIds = new Set<number>();
  const statisticInstrumentIds = new Set<number>();
  let subscribeAllTickers = false;
  let subscribeAllStatistics = false;

  for (const { subscription } of entries) {
    switch (subscription.topic) {
      case 'perps.tickers':
        if (subscription.instrumentId === undefined) {
          subscribeAllTickers = true;
        } else {
          tickerInstrumentIds.add(subscription.instrumentId);
        }
        break;
      case 'perps.statistics':
        if (subscription.instrumentId === undefined) {
          subscribeAllStatistics = true;
        } else {
          statisticInstrumentIds.add(subscription.instrumentId);
        }
        break;
      default:
        channels.add(channelFor(subscription));
    }
  }

  if (subscribeAllTickers) {
    channels.add('tickers::all');
  } else {
    for (const instrumentId of tickerInstrumentIds) {
      channels.add(`tickers::${instrumentId}`);
    }
  }

  if (subscribeAllStatistics) {
    channels.add('statistics::all');
  } else {
    for (const instrumentId of statisticInstrumentIds) {
      channels.add(`statistics::${instrumentId}`);
    }
  }

  return channels;
}

function channelsAdded(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): string[] {
  return Array.from(after).filter((channel) => !before.has(channel));
}

function channelsRemoved(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): string[] {
  return Array.from(before).filter((channel) => !after.has(channel));
}

function channelFor(subscription: PerpsMarketDataSubscription): string {
  switch (subscription.topic) {
    case 'perps.trades':
      return `trades::${subscription.instrumentId}`;
    case 'perps.bbo':
      return `bbo::${subscription.instrumentId}`;
    case 'perps.book':
      return `book::${subscription.instrumentId}`;
    case 'perps.candles':
      return `klines::${subscription.instrumentId}::${subscription.interval}`;
    case 'perps.tickers':
      return subscription.instrumentId === undefined
        ? 'tickers::all'
        : `tickers::${subscription.instrumentId}`;
    case 'perps.statistics':
      return subscription.instrumentId === undefined
        ? 'statistics::all'
        : `statistics::${subscription.instrumentId}`;
    default: {
      const neverSpec: never = subscription;
      invariant(false, `Unknown Perps topic: ${String(neverSpec)}`);
    }
  }
}

function matcherFor(
  subscription: PerpsMarketDataSubscription,
): (event: PerpsMarketDataEvent) => boolean {
  switch (subscription.topic) {
    case 'perps.trades':
      return (event) =>
        event.topic === 'perps.trades' &&
        event.channel === `trades::${subscription.instrumentId}`;
    case 'perps.bbo':
    case 'perps.book':
      return (event) =>
        event.topic === subscription.topic &&
        event.payload.instrumentId === subscription.instrumentId;
    case 'perps.candles':
      return (event) =>
        event.topic === 'perps.candles' &&
        event.payload.instrumentId === subscription.instrumentId &&
        event.payload.interval === subscription.interval;
    case 'perps.tickers':
    case 'perps.statistics':
      return (event) =>
        event.topic === subscription.topic &&
        (subscription.instrumentId === undefined ||
          event.payload.instrumentId === subscription.instrumentId);
    default: {
      const neverSpec: never = subscription;
      invariant(false, `Unknown Perps topic: ${String(neverSpec)}`);
    }
  }
}
