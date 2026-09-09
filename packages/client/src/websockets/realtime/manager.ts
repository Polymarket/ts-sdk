import type { ApiKeyCreds } from '@polymarket/bindings/clob';
import type { PriceEvent } from '@polymarket/bindings/subscriptions';
import { parsePriceSubscription } from '../../actions/price-subscriptions';
import type {
  PriceSubscription,
  SubscriptionHandle,
} from '../../actions/subscriptions';
import type { WebSocketSubscriptionManager } from '../types';
import { SocketPool } from './pool';

export type { SubscribeError } from '../../actions/subscriptions';

export type RealtimeWebSocketManagerOptions = {
  url: string;
  headers?: Record<string, string>;
  credentials: ApiKeyCreds;
};

/** Manages authenticated realtime prices across shared connections. */
export class RealtimeWebSocketManager
  implements WebSocketSubscriptionManager<PriceSubscription, PriceEvent>
{
  readonly #pool: SocketPool;

  constructor(options: RealtimeWebSocketManagerOptions) {
    this.#pool = new SocketPool(options);
  }

  /**
   * Starts a price subscription and awaits server acceptance.
   * @throws {@link SubscribeError} When input is invalid or the subscription fails.
   */
  async subscribe(
    spec: PriceSubscription,
  ): Promise<SubscriptionHandle<PriceEvent>> {
    return this.#pool.subscribe(parsePriceSubscription(spec));
  }

  /** Closes every active price subscription and shared connection. */
  async close(): Promise<void> {
    await this.#pool.close();
  }
}
