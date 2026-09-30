import type { PriceEvent } from '@polymarket/bindings/subscriptions';
import { pushable } from 'it-pushable';
import type {
  PriceSubscription,
  SubscriptionHandle,
} from '../../actions/subscriptions';
import { subscriptionsFor } from './protocol';
import { type PriceListener, PriceSession } from './session';
import { PolyboltConnection, type PolyboltConnectionOptions } from './socket';

/** @internal Keeps each filter on exactly one connection until it is removed. */
export class SocketPool {
  readonly #options: PolyboltConnectionOptions;
  readonly #sockets = new Set<PriceSession>();
  readonly #closers = new Set<() => Promise<void>>();
  constructor(options: PolyboltConnectionOptions) {
    this.#options = options;
  }

  async subscribe(
    spec: PriceSubscription,
  ): Promise<SubscriptionHandle<PriceEvent>> {
    const subscriptions = [
      ...new Map(
        subscriptionsFor(spec).map((subscription) => [
          subscription.key,
          subscription,
        ]),
      ).values(),
    ];
    const queue = pushable<PriceEvent>({ objectMode: true });
    const releases: (() => void)[] = [];
    let closed = false;
    let terminalError: Error | undefined;
    const close = async () => {
      if (closed) return;
      closed = true;
      for (const release of releases) release();
      if (terminalError === undefined) await queue.return();
      else queue.end(terminalError);
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
                      symbol:
                        'symbol' in subscription
                          ? subscription.symbol
                          : event.payload.symbol,
                    }
                  : event.payload;
              // Each shared key uses the same canonical symbol spelling.
              queue.push({
                ...event,
                payload,
              } as PriceEvent);
            },
            end(error) {
              terminalError = error;
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

  #place(key: string): PriceSession {
    for (const socket of this.#sockets) {
      if (socket.closed) this.#sockets.delete(socket);
      else if (socket.has(key)) return socket;
    }
    for (const socket of this.#sockets)
      if (socket.size < socket.keyTarget) return socket;
    const socket = new PriceSession(new PolyboltConnection(this.#options));
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
