import type { ApiKeyCreds } from '@polymarket/bindings/clob';
import type {
  CommentsSubscription,
  CryptoPricesChainlinkTwapSubscription,
  CryptoPricesSubscription,
  EquityPricesSubscription,
  PriceSubscription,
  SubscriptionHandle,
} from '../../actions/subscriptions';
import { UserInputError } from '../../errors';
import type { WebSocketSubscriptionManager } from '../types';
import { LegacyRtdsTransport } from './legacy';
import { type RealtimeManagerEvent, SocketPool } from './pool';

export type { SubscribeError } from '../../actions/subscriptions';

export type RealtimeSpec =
  | CommentsSubscription
  | CryptoPricesSubscription
  | CryptoPricesChainlinkTwapSubscription
  | EquityPricesSubscription
  | PriceSubscription;
export type RealtimeWebSocketManagerOptions = {
  url: string;
  headers?: Record<string, string>;
  protocol?: 'rtds' | 'polybolt';
  legacyUrl?: string;
  legacyHeaders?: Record<string, string>;
  credentials?: ApiKeyCreds;
};

/** Manages shared realtime price and comment subscriptions. */
export class RealtimeWebSocketManager
  implements WebSocketSubscriptionManager<RealtimeSpec, RealtimeManagerEvent>
{
  readonly #legacy: LegacyRtdsTransport;
  readonly #pool?: SocketPool;
  readonly #protocol: 'rtds' | 'polybolt';
  constructor(options: RealtimeWebSocketManagerOptions) {
    this.#protocol = options.protocol ?? 'rtds';
    this.#legacy = new LegacyRtdsTransport({
      url:
        this.#protocol === 'rtds'
          ? options.url
          : (options.legacyUrl ?? 'wss://ws-live-data.polymarket.com'),
      headers:
        this.#protocol === 'rtds' ? options.headers : options.legacyHeaders,
    });
    if (this.#protocol === 'polybolt' && options.credentials !== undefined) {
      this.#pool = new SocketPool({
        url: options.url,
        headers: options.headers,
        credentials: options.credentials,
      });
    }
  }

  /**
   * Starts a realtime subscription, awaiting server acceptance when supported.
   * @throws {@link SubscribeError} When input is invalid or the subscription fails.
   */
  async subscribe(
    spec: RealtimeSpec,
  ): Promise<SubscriptionHandle<RealtimeManagerEvent>> {
    switch (spec.topic) {
      case 'comments':
      case 'prices.crypto.chainlink':
        return this.#legacy.subscribe(spec);
      case 'prices.crypto.binance':
      case 'prices.crypto.chainlink.twap':
      case 'prices.equity.pyth':
        if (this.#protocol === 'rtds') return this.#legacy.subscribe(spec);
    }
    if (this.#protocol !== 'polybolt')
      throw new UserInputError(
        'These price topics are not enabled in this environment yet.',
      );
    if (this.#pool === undefined)
      throw new UserInputError('This subscription requires a secure client.');
    return this.#pool.subscribe(spec);
  }

  /** Closes every active subscription and shared connection. */
  async close(): Promise<void> {
    await Promise.all([this.#legacy.close(), this.#pool?.close()]);
  }
}

/** @deprecated Use RealtimeWebSocketManager. Removed two months after the default stream migration release. */
export { RealtimeWebSocketManager as RtdsWebSocketManager };
