import {
  type SportsEvent,
  SportsResultEventSchema,
} from '@polymarket/bindings/subscriptions';
import type {
  SportsSubscription,
  SubscriptionHandle,
} from '../actions/subscriptions';
import { createSubscriptionHandle } from './handle';
import { SportsWebSocketHeartbeat } from './heartbeat';
import {
  ReconnectScheduler,
  WebSocketConnection,
  type WebSocketConnectionResult,
} from './lifecycle';
import {
  SubscriptionRegistry,
  type SubscriptionRegistryEntry,
} from './registry';
import type { WebSocketSubscriptionManager } from './types';

type SportsSubscriptionEntry = SubscriptionRegistryEntry<
  SportsSubscription,
  SportsEvent
>;

export type SportsWebSocketManagerOptions = {
  headers?: Record<string, string>;
  url: string;
};

/**
 * Sports WebSocket manager.
 *
 * The sports stream starts sending events immediately after connection and does
 * not require a subscribe frame. The server sends `ping`; clients must reply
 * with `pong` to keep the socket alive.
 */
export class SportsWebSocketManager
  implements WebSocketSubscriptionManager<SportsSubscription, SportsEvent>
{
  readonly #headers: Record<string, string> | undefined;
  readonly #url: string;
  #closing: Promise<void> | undefined;
  readonly #connection = new WebSocketConnection({
    heartbeat: new SportsWebSocketHeartbeat(),
  });
  readonly #reconnectScheduler = new ReconnectScheduler();
  readonly #subscriptions = new SubscriptionRegistry<
    SportsSubscription,
    SportsEvent
  >();

  constructor(options: SportsWebSocketManagerOptions) {
    this.#headers = options.headers;
    this.#url = options.url;
  }

  async subscribe(
    subscription: SportsSubscription,
  ): Promise<SubscriptionHandle<SportsEvent>> {
    const { entry } = this.#subscriptions.add(subscription);

    await this.#registerSubscriber(entry);
    return createSubscriptionHandle(entry.subscriber.queue, () =>
      this.#closeSubscriber(entry),
    );
  }

  // Subscription handle lifecycle.

  async #registerSubscriber(entry: SportsSubscriptionEntry): Promise<void> {
    try {
      await this.#connect();
    } catch (error) {
      await this.#closeSubscriber(entry);
      throw error;
    }
  }

  async #closeSubscriber(entry: SportsSubscriptionEntry): Promise<void> {
    this.#subscriptions.remove(entry);

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
  }

  #onConnectionMessage(message: unknown): void {
    const parsed = SportsResultEventSchema.safeParse(message);
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

  #scheduleReconnect(): void {
    this.#reconnectScheduler.schedule({
      reconnect: () => this.#connect(),
      shouldReconnect: () => this.#subscriptions.hasActiveSubscriptions(),
    });
  }
}
