import type {
  PriceEvent,
  PriceProvider,
} from '@polymarket/bindings/subscriptions';
import { pushable } from 'it-pushable';
import type {
  PriceSubscription,
  SubscriptionHandle,
} from '../../actions/subscriptions';
import { TransportError } from '../../errors';
import { subscriptionsFor } from './protocol';
import { type PriceListener, PriceSession } from './session';
import { PolyboltConnection, type PolyboltConnectionOptions } from './socket';

/** @internal Keeps each filter on exactly one connection until it is removed. */
export class SocketPool {
  readonly #options: PolyboltConnectionOptions;
  readonly #sockets = new Map<PriceSession, PriceProvider | undefined>();
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
    const fail = (cause: unknown) => {
      if (closed) return;
      terminalError = TransportError.fromError(cause);
      queue.end(terminalError);
      void close();
    };
    try {
      // A cached confirmation can call back synchronously inside `add`, so every
      // promise is created and given a handler before any of them is awaited.
      const pending = subscriptions.map((subscription) => {
        if (closed) return Promise.resolve();
        const socket = this.#place(subscription.key, subscription.provider);
        const listener: PriceListener = {
          subscribed(confirmation) {
            if (closed || !('onSubscribed' in spec)) return;
            try {
              void Promise.resolve(spec.onSubscribed?.(confirmation)).catch(
                fail,
              );
            } catch (cause) {
              fail(cause);
            }
          },
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
      });
      for (const promise of pending) promise.catch(() => undefined);
      await Promise.all(pending);
      if (terminalError !== undefined) throw terminalError;
    } catch (error) {
      await close();
      throw terminalError ?? error;
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

  #place(key: string, provider: PriceProvider | undefined): PriceSession {
    for (const socket of this.#sockets.keys()) {
      if (socket.closed) this.#sockets.delete(socket);
      else if (socket.has(key)) return socket;
    }
    // Different pins can collapse to one server key or produce indistinguishable
    // fallback streams. Keep each connection's requested-provider group fixed,
    // including while idle and across reconnects.
    for (const [socket, requestedProvider] of this.#sockets)
      if (requestedProvider === provider && socket.size < socket.keyTarget)
        return socket;
    const socket = new PriceSession(new PolyboltConnection(this.#options));
    this.#sockets.set(socket, provider);
    return socket;
  }

  async close(): Promise<void> {
    await Promise.all([...this.#closers].map((close) => close()));
    const sockets = [...this.#sockets.keys()];
    this.#sockets.clear();
    await Promise.all(sockets.map((socket) => socket.close()));
  }
}
