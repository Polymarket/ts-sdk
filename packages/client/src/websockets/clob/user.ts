import {
  type BearerCredentials,
  SocketAuthResponseSchema,
} from '@polymarket/bindings';
import type { ApiKeyCreds } from '@polymarket/bindings/clob';
import {
  type UserEvent,
  UserEventSchema,
} from '@polymarket/bindings/subscriptions';
import { setNonBlockingTimeout } from '@polymarket/types';
import type {
  SubscriptionHandle,
  UserSubscription,
} from '../../actions/subscriptions';
import { RequestRejectedError, TransportError } from '../../errors';
import type { AuthSession } from '../../session';
import { SocketAuthentication } from '../authentication';
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
  credentials?: ApiKeyCreds;
  session?: AuthSession;
  headers?: Record<string, string>;
  url: string;
};

export class ClobUserWebSocketManager
  implements WebSocketSubscriptionManager<UserSubscription, UserEvent>
{
  readonly #credentials: ApiKeyCreds | undefined;
  readonly #authentication: SocketAuthentication | undefined;
  #auth: { resolve: () => void; reject: (error: Error) => void } | undefined;
  #authUnavailable = 0;
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
    if (options.session !== undefined)
      this.#authentication = new SocketAuthentication({
        session: options.session,
        authenticate: (token) => this.#renew(token),
        expired: () => {
          this.#authentication?.stop();
          this.#auth?.reject(new TransportError('User connection expired.'));
          void this.#connection.close().then(() => this.#scheduleReconnect());
        },
        fail: (error) => {
          this.#subscriptions.endAll(error);
          void this.close();
        },
      });
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
    this.#authUnavailable = 0;
    this.#authentication?.stop();
    this.#auth?.reject(new TransportError('User connection closed.'));
    this.#reconnectScheduler.stop();
    this.#subscriptions.endAll();

    await this.#connection.close();
  }

  #connect(): Promise<WebSocketConnectionResult> {
    return this.#connection.connect({
      onConnectionLost: (info) => {
        this.#authentication?.stop();
        this.#auth?.reject(new TransportError('User connection closed.'));
        if (
          (info.code === 1008 && info.reason !== 'authentication expired') ||
          (info.code === 1013 && ++this.#authUnavailable >= 3)
        ) {
          this.#subscriptions.endAll(
            new RequestRejectedError('User stream authentication failed.', {
              status: 401,
            }),
          );
          return;
        }
        this.#onConnectionLost();
      },
      onError: () => this.#onConnectionError(),
      onMessage: (message) => this.#onConnectionMessage(message),
      onOpen: (credentials) => this.#onConnectionOpen(credentials),
      prepare: async () => {
        const credentials =
          (await this.#authentication?.prepare()) ?? this.#credentials;
        if (credentials === undefined)
          throw new TransportError('User stream credentials are missing.');
        return credentials;
      },
      headers: this.#headers,
      url: this.#url,
    });
  }

  #onConnectionOpen(credentials: ApiKeyCreds | BearerCredentials): void {
    this.#reconnectScheduler.resetBackoff();
    this.#sendInitialSubscription(credentials);
    if ('accessToken' in credentials)
      this.#authentication?.accepted(credentials.accessToken);
  }

  #onConnectionMessage(message: unknown): void {
    const auth = SocketAuthResponseSchema.safeParse(message);
    if (auth.success) {
      if (auth.data.success) {
        this.#authUnavailable = 0;
        this.#auth?.resolve();
      } else
        this.#auth?.reject(
          new RequestRejectedError('User stream renewal rejected.', {
            status: 401,
          }),
        );
      return;
    }
    const events = Array.isArray(message) ? message : [message];
    for (const eventData of events) {
      const parsed = UserEventSchema.safeParse(eventData);
      if (!parsed.success) continue;
      this.#authUnavailable = 0;
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

  #sendInitialSubscription(credentials: ApiKeyCreds | BearerCredentials): void {
    this.#connection.send(
      buildUserSubscribeMessage(this.#subscriptions.serverState(), credentials),
    );
  }

  async #renew(accessToken: string): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    this.#auth = { resolve, reject };
    const timer = setNonBlockingTimeout(
      () =>
        reject(
          new TransportError('User authentication acknowledgement timed out.'),
        ),
      10_000,
    );
    try {
      if (!this.#connection.send({ type: 'auth', auth: { accessToken } }))
        throw new TransportError('User connection is not open.');
      await promise;
    } finally {
      clearTimeout(timer);
      this.#auth = undefined;
    }
  }

  #scheduleReconnect(): void {
    this.#reconnectScheduler.schedule({
      reconnect: () => this.#connect(),
      shouldReconnect: () => this.#subscriptions.hasActiveSubscriptions(),
    });
  }
}
