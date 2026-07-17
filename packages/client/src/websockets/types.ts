import type {
  CommentsEvent,
  CryptoPricesEvent,
  EquityPricesEvent,
  MarketEvent,
  PerpsMarketDataEvent,
  SportsEvent,
  UserEvent,
} from '@polymarket/bindings/subscriptions';
import type {
  CommentsSubscription,
  CryptoPricesSubscription,
  EquityPricesSubscription,
  MarketSubscription,
  PerpsMarketDataSubscription,
  SportsSubscription,
  SubscriptionHandle,
  UserSubscription,
} from '../actions/subscriptions';
import type { PerpsSessionManager } from './perps/manager';
import type { RfqQuoterWebSocketManager } from './rfq';

/**
 * An authenticated bidirectional WebSocket session.
 *
 * The session is an async iterable of server-initiated events and also exposes
 * `send` for protocol messages that respond to, update, or otherwise interact
 * with that stream. Callers control processing semantics: await event handlers
 * inline for sequential handling, or dispatch work without awaiting to fan out.
 */
export interface WebSocketSession<TEvent, TMessage>
  extends AsyncIterable<TEvent> {
  /**
   * Closes the session. Idempotent: subsequent calls resolve without effect.
   */
  close(): Promise<void>;

  /**
   * Sends a protocol message on this authenticated websocket session.
   */
  send(message: TMessage): Promise<void>;
}

/**
 * A WebSocket manager owns a single upstream socket surface and exposes a
 * typed `subscribe` that only accepts specs it can serve and only yields the
 * events it produces.
 *
 * `TSpec` is the union of subscription specs this manager accepts. The caller
 * issues one `subscribe` call per spec; callers that need to subscribe to
 * several specs at once can compose per-spec handles through a higher-level
 * merge helper.
 *
 * `TEvent` is the union of events it emits for any spec it accepts.
 *
 * `close()` is best-effort and idempotent.
 */
export interface WebSocketSubscriptionManager<TSpec, TEvent> {
  subscribe(subscription: TSpec): Promise<SubscriptionHandle<TEvent>>;

  close(): Promise<void>;
}

// Surfaces available on the public client.
export type PublicWebSocketManagers = {
  readonly clobMarket: WebSocketSubscriptionManager<
    MarketSubscription,
    MarketEvent
  >;
  readonly sports: WebSocketSubscriptionManager<
    SportsSubscription,
    SportsEvent
  >;
  readonly rtds: WebSocketSubscriptionManager<
    CommentsSubscription | CryptoPricesSubscription | EquityPricesSubscription,
    CommentsEvent | CryptoPricesEvent | EquityPricesEvent
  >;
  readonly perpsSubscriptions: WebSocketSubscriptionManager<
    PerpsMarketDataSubscription,
    PerpsMarketDataEvent
  >;
};

// Secure client additionally exposes the user surface.
export type SecureWebSocketManagers = PublicWebSocketManagers & {
  readonly clobUser: WebSocketSubscriptionManager<UserSubscription, UserEvent>;
  readonly perpsSession: PerpsSessionManager;
  readonly rfqQuoter: RfqQuoterWebSocketManager;
};
