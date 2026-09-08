import type {
  CommentsEvent,
  CryptoPricesBinanceSnapshotEvent,
  CryptoPricesChainlinkTwapSnapshotEvent,
  CryptoPricesEvent,
  EquityPricesEvent,
  PriceEvent,
} from '@polymarket/bindings/subscriptions';
import { pushable } from 'it-pushable';
import type { SubscriptionHandle } from '../../actions/subscriptions';
import { type PolyboltSpec, subscriptionsFor } from './protocol';
import {
  PolyboltSocket,
  type PolyboltSocketOptions,
  type PriceListener,
} from './socket';

export type RealtimePriceEvent =
  | PriceEvent
  | CryptoPricesEvent
  | EquityPricesEvent
  | CryptoPricesBinanceSnapshotEvent
  | CryptoPricesChainlinkTwapSnapshotEvent;
export type RealtimeManagerEvent = RealtimePriceEvent | CommentsEvent;

/** @internal Keeps each filter on exactly one connection until it is removed. */
export class SocketPool {
  readonly #options: PolyboltSocketOptions;
  readonly #sockets = new Set<PolyboltSocket>();
  readonly #closers = new Set<() => Promise<void>>();
  constructor(options: PolyboltSocketOptions) {
    this.#options = options;
  }

  async subscribe(
    spec: PolyboltSpec,
  ): Promise<SubscriptionHandle<RealtimePriceEvent>> {
    const subscriptions = subscriptionsFor(spec);
    const queue = pushable<RealtimePriceEvent>({ objectMode: true });
    const releases: (() => void)[] = [];
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      for (const release of releases) release();
      queue.end();
      this.#closers.delete(close);
    };
    this.#closers.add(close);
    try {
      await Promise.all(
        subscriptions.map((subscription) => {
          const socket = this.#place(subscription.key);
          const listener: PriceListener = {
            event(event) {
              if (closed) return;
              if (event.type === 'subscribe') {
                if (
                  (spec.topic === 'prices.crypto.binance' ||
                    spec.topic === 'prices.crypto.chainlink.twap') &&
                  !spec.includeSnapshot
                )
                  return;
              }
              if (
                'types' in spec &&
                spec.types !== undefined &&
                spec.types.length > 0 &&
                !spec.types.includes(event.type)
              )
                return;
              const payload =
                'symbol' in event.payload
                  ? {
                      ...event.payload,
                      symbol: subscription.symbol ?? event.payload.symbol,
                    }
                  : event.payload;
              // Wire payloads are normalized in bindings. Here only caller-owned aliases change.
              queue.push({
                ...event,
                topic: spec.topic,
                payload,
              } as RealtimePriceEvent);
            },
            end(error) {
              queue.end(error);
              void close();
            },
          };
          releases.push(() => socket.remove(subscription.key, listener));
          return socket.add(subscription, listener);
        }),
      );
    } catch (error) {
      await close();
      throw error;
    }
    return {
      close,
      async *[Symbol.asyncIterator]() {
        try {
          yield* queue;
        } finally {
          await close();
        }
      },
    };
  }

  #place(key: string): PolyboltSocket {
    for (const socket of this.#sockets) {
      if (socket.closed) this.#sockets.delete(socket);
      else if (socket.has(key)) return socket;
    }
    for (const socket of this.#sockets)
      if (socket.size < socket.keyTarget) return socket;
    const socket = new PolyboltSocket(this.#options);
    this.#sockets.add(socket);
    return socket;
  }

  async close(): Promise<void> {
    await Promise.all([...this.#closers].map((close) => close()));
    const sockets = [...this.#sockets];
    this.#sockets.clear();
    await Promise.all(sockets.map((socket) => socket.close()));
  }
}
