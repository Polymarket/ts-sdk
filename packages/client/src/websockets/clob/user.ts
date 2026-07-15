import type { ApiKeyCreds } from '@polymarket/bindings/clob';
import {
  type UserEvent,
  UserEventSchema,
} from '@polymarket/bindings/subscriptions';
import type {
  SubscriptionHandle,
  UserSubscription,
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
  buildUserSubscribeMessage,
  deriveUserServerSubscription,
  syncUserSubscription,
  type UserServerSubscription,
  type UserSubscriptionEntry,
  userMatcherFor,
} from './protocol';

export type ClobUserWebSocketManagerOptions = {
  credentials: ApiKeyCreds;
  headers?: Record<string, string>;
  url: string;
};

export class ClobUserWebSocketManager
  implements WebSocketSubscriptionManager<UserSubscription, UserEvent>
{
  readonly #credentials: ApiKeyCreds;
  readonly #headers: Record<string, string> | undefined;
  readonly #url: string;
  #closing: Promise<void> | undefined;
  readonly #connection = new WebSocketConnection({
    heartbeat: new ClobWebSocketHeartbeat(),
  });
  readonly #reconnectScheduler = new ReconnectScheduler();
  readonly #subscriptions = new SubscriptionRegistry<
    UserSubscription,
    UserEvent,
    UserServerSubscription
  >({ deriveServerState: deriveUserServerSubscription });

  constructor(options: ClobUserWebSocketManagerOptions) {
    this.#credentials = options.credentials;
    this.#headers = options.headers;
    this.#url = options.url;
  }

  async subscribe(
    subscription: UserSubscription,
  ): Promise<SubscriptionHandle<UserEvent>> {
    const { change, entry } = this.#subscriptions.add(subscription, {
      matches: userMatcherFor(subscription),
    });

    await this.#registerSubscriber(entry, change);
    return createSubscriptionHandle(entry.subscriber.queue, () =>
      this.#closeSubscriber(entry),
    );
  }

  async #registerSubscriber(
    entry: UserSubscriptionEntry,
    change: SubscriptionRegistryChange<UserServerSubscription>,
  ): Promise<void> {
    const { before, after } = change;

    try {
      const connection = await this.#connect();
      if (connection.reusedOpenSocket) {
        syncUserSubscription(
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

  async #closeSubscriber(entry: UserSubscriptionEntry): Promise<void> {
    const { before, after } = this.#subscriptions.remove(entry);

    if (!this.#subscriptions.hasActiveSubscriptions()) {
      await this.close();
      return;
    }

    syncUserSubscription(
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
      onOpen: (credentials) => this.#onConnectionOpen(credentials),
      prepare: () => this.#credentials,
      headers: this.#headers,
      url: this.#url,
    });
  }

  #onConnectionOpen(credentials: ApiKeyCreds): void {
    this.#reconnectScheduler.resetBackoff();
    this.#sendInitialSubscription(credentials);
  }

  #onConnectionMessage(message: unknown): void {
    const events = Array.isArray(message) ? message : [message];
    for (const eventData of events) {
      const parsed = UserEventSchema.safeParse(eventData);
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

  #sendInitialSubscription(credentials: ApiKeyCreds): void {
    this.#connection.send(
      buildUserSubscribeMessage(this.#subscriptions.serverState(), credentials),
    );
  }

  #scheduleReconnect(): void {
    this.#reconnectScheduler.schedule({
      reconnect: () => this.#connect(),
      shouldReconnect: () => this.#subscriptions.hasActiveSubscriptions(),
    });
  }
}
