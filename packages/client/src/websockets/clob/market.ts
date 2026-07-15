import {
  type MarketEvent,
  MarketEventSchema,
} from '@polymarket/bindings/subscriptions';
import type {
  MarketSubscription,
  SubscriptionHandle,
} from '../../actions/subscriptions';
import { createSubscriptionHandle } from '../handle';
import { ClobWebSocketHeartbeat } from '../heartbeat';
import {
  ReconnectScheduler,
  WebSocketConnection,
  type WebSocketConnectionResult,
} from '../lifecycle';
import {
  SubscriptionRegistry,
  type SubscriptionRegistryChange,
} from '../registry';
import type { WebSocketSubscriptionManager } from '../types';
import {
  buildMarketSubscribeMessage,
  deriveMarketServerSubscription,
  type MarketServerSubscription,
  type MarketSubscriptionEntry,
  marketMatcherFor,
  syncMarketSubscription,
} from './protocol';

export type ClobMarketWebSocketManagerOptions = {
  headers?: Record<string, string>;
  url: string;
};

/**
 * CLOB market WebSocket manager.
 *
 * The CLOB server tracks market subscriptions by asset id on the connection.
 * Incremental subscribe/unsubscribe frames mutate that server-side asset set.
 */
export class ClobMarketWebSocketManager
  implements WebSocketSubscriptionManager<MarketSubscription, MarketEvent>
{
  readonly #headers: Record<string, string> | undefined;
  readonly #url: string;
  #closing: Promise<void> | undefined;
  readonly #connection = new WebSocketConnection({
    heartbeat: new ClobWebSocketHeartbeat(),
  });
  readonly #reconnectScheduler = new ReconnectScheduler();
  readonly #subscriptions = new SubscriptionRegistry<
    MarketSubscription,
    MarketEvent,
    MarketServerSubscription
  >({ deriveServerState: deriveMarketServerSubscription });

  constructor(options: ClobMarketWebSocketManagerOptions) {
    this.#headers = options.headers;
    this.#url = options.url;
  }

  async subscribe(
    subscription: MarketSubscription,
  ): Promise<SubscriptionHandle<MarketEvent>> {
    const { change, entry } = this.#subscriptions.add(subscription, {
      matches: marketMatcherFor(subscription),
    });

    await this.#registerSubscriber(entry, change);
    return createSubscriptionHandle(entry.subscriber.queue, () =>
      this.#closeSubscriber(entry),
    );
  }

  async #registerSubscriber(
    entry: MarketSubscriptionEntry,
    change: SubscriptionRegistryChange<MarketServerSubscription>,
  ): Promise<void> {
    const { before, after } = change;

    try {
      const connection = await this.#connect();
      if (connection.reusedOpenSocket) {
        syncMarketSubscription(
          (message) => this.#connection.send(message),
          before,
          after,
        );
      }
    } catch (error) {
      await this.#closeSubscriber(entry);
      throw error;
    }
  }

  async #closeSubscriber(entry: MarketSubscriptionEntry): Promise<void> {
    const { before, after } = this.#subscriptions.remove(entry);

    if (!this.#subscriptions.hasActiveSubscriptions()) {
      await this.close();
      return;
    }

    syncMarketSubscription(
      (message) => this.#connection.send(message),
      before,
      after,
    );
  }

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
    this.#sendInitialSubscription();
  }

  #onConnectionMessage(message: unknown): void {
    const events = Array.isArray(message) ? message : [message];
    for (const eventData of events) {
      const parsed = MarketEventSchema.safeParse(eventData);
      if (!parsed.success) continue;
      this.#subscriptions.dispatch(parsed.data);
    }
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

  #sendInitialSubscription(): void {
    this.#connection.send(
      buildMarketSubscribeMessage(this.#subscriptions.serverState()),
    );
  }

  #scheduleReconnect(): void {
    this.#reconnectScheduler.schedule({
      reconnect: () => this.#connect(),
      shouldReconnect: () => this.#subscriptions.hasActiveSubscriptions(),
    });
  }
}
