import {
  type PriceEvent,
  RealtimeKnownErrorCode,
} from '@polymarket/bindings/subscriptions';
import { setNonBlockingTimeout } from '@polymarket/types';
import {
  ConnectionLostError,
  RequestRejectedError,
  TransportError,
} from '../../errors';
import { ReconnectScheduler, type WebSocketCloseInfo } from '../lifecycle';
import { type PriceKey, polyboltReconnectDelay } from './protocol';

type KeyState = {
  subscription: PriceKey;
  listeners: Set<PriceListener>;
  ready: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
  subscribed: boolean;
  accepted: boolean;
  snapshot?: PriceEvent;
};
export type PriceListener = {
  event: (event: PriceEvent) => void;
  end: (error: Error) => void;
};
export enum PriceSubscriptionOperation {
  Subscribe = 'subscribe',
  Unsubscribe = 'unsubscribe',
}
export type PriceSubscriptionRejection = {
  key: string;
  error: RequestRejectedError;
};
export type PriceSessionEvents = {
  event: (event: PriceEvent) => void;
  dropped: () => void;
  disconnected: (info: WebSocketCloseInfo) => void;
};
/** @internal Operations required by subscription policy, independent of a wire protocol. */
export type PriceSessionConnection = {
  open: (events: PriceSessionEvents) => Promise<void>;
  authorize: () => Promise<void>;
  change: (
    operation: PriceSubscriptionOperation,
    subscriptions: readonly PriceKey[],
  ) => Promise<PriceSubscriptionRejection[]>;
  close: () => Promise<void>;
};
type QueuedOp = { op: PriceSubscriptionOperation; keys: KeyState[] };

/** @internal Owns acceptance, listener sharing, recovery, and subscription ordering. */
export class PriceSession {
  readonly #connection: PriceSessionConnection;
  readonly #scheduler = new ReconnectScheduler();
  readonly #keys = new Map<string, KeyState>();
  #ops: QueuedOp[] = [];
  #flushTimer: ReturnType<typeof setTimeout> | undefined;
  #idleTimer: ReturnType<typeof setTimeout> | undefined;
  #authenticated = false;
  #closed = false;
  #flushing = false;
  #restarting = false;
  #connecting: Promise<void> | undefined;
  #generation = 0;
  #keyTarget = 64;
  #lastDropAt = Number.NEGATIVE_INFINITY;

  constructor(connection: PriceSessionConnection) {
    this.#connection = connection;
  }
  get size(): number {
    return this.#keys.size;
  }
  has(key: string): boolean {
    return this.#keys.has(key);
  }
  get closed(): boolean {
    return this.#closed;
  }
  get keyTarget(): number {
    return Date.now() - this.#lastDropAt >= 60_000 ? 64 : this.#keyTarget;
  }

  add(subscription: PriceKey, listener: PriceListener): Promise<void> {
    clearTimeout(this.#idleTimer);
    let state = this.#keys.get(subscription.key);
    if (state === undefined) {
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      // Reconnects may reject a ready promise before the caller attaches its await.
      void promise.catch(() => undefined);
      state = {
        subscription,
        listeners: new Set(),
        ready: promise,
        resolve,
        reject,
        subscribed: false,
        accepted: false,
      };
      this.#keys.set(subscription.key, state);
      if (this.#authenticated)
        this.#enqueue(PriceSubscriptionOperation.Subscribe, [state]);
    }
    state.listeners.add(listener);
    if (state.snapshot !== undefined) listener.event(state.snapshot);
    if (
      !this.#authenticated &&
      !this.#restarting &&
      this.#connecting === undefined &&
      !this.#scheduler.isScheduled
    ) {
      void this.#connect();
    }
    // A joining caller does not own a handle until acceptance. Bound its wait
    // independently so an existing listener can continue reconnecting.
    return awaitAcceptance(state.ready);
  }

  remove(key: string, listener: PriceListener): void {
    const state = this.#keys.get(key);
    if (state === undefined) return;
    state.listeners.delete(listener);
    if (state.listeners.size > 0) return;
    this.#keys.delete(key);
    state.reject(new TransportError('Realtime subscription closed.'));
    // Retain unsubscribe ordering even when subscribe is already in flight.
    if (this.#authenticated)
      this.#enqueue(PriceSubscriptionOperation.Unsubscribe, [state]);
    if (this.#keys.size === 0)
      this.#idleTimer = setNonBlockingTimeout(() => {
        void this.close();
      }, 1_000);
  }

  #connect(): Promise<void> {
    if (this.#closed || this.#restarting) return Promise.resolve();
    if (this.#connecting !== undefined) return this.#connecting;
    const connecting = this.#open()
      .catch((cause: unknown) => {
        this.#rejectKeys(
          [...this.#keys.values()].filter((key) => !key.accepted),
          TransportError.fromError(cause),
        );
      })
      .finally(() => {
        if (this.#connecting === connecting) this.#connecting = undefined;
        if (!this.#authenticated) this.#schedule(1006);
      });
    this.#connecting = connecting;
    return connecting;
  }

  async #open(): Promise<void> {
    const generation = this.#generation;
    await this.#connection.open({
      event: (event) => this.#event(event),
      dropped: () => this.#recordDrop(),
      disconnected: (info) => this.#lost(info),
    });
    if (this.#closed || generation !== this.#generation) return;
    try {
      await this.#connection.authorize();
      if (this.#closed || generation !== this.#generation) return;
      this.#authenticated = true;
      this.#enqueue(PriceSubscriptionOperation.Subscribe, [
        ...this.#keys.values(),
      ]);
    } catch (error) {
      if (this.#closed || generation !== this.#generation) return;
      if (
        error instanceof RequestRejectedError &&
        error.code !== RealtimeKnownErrorCode.AuthUnavailable
      ) {
        this.#fail(error);
      } else {
        await this.#restart(1006);
      }
    }
  }

  #enqueue(op: PriceSubscriptionOperation, keys: KeyState[]): void {
    if (keys.length === 0) return;
    const last = this.#ops.at(-1);
    if (last?.op === op) last.keys.push(...keys);
    else this.#ops.push({ op, keys });
    this.#scheduleFlush();
  }

  #scheduleFlush(): void {
    if (
      this.#flushTimer !== undefined ||
      this.#flushing ||
      !this.#authenticated ||
      this.#closed
    )
      return;
    // Collect adjacent changes; the connection owns operation pacing.
    this.#flushTimer = setNonBlockingTimeout(() => {
      this.#flushTimer = undefined;
      void this.#flush();
    }, 10);
  }

  async #flush(): Promise<void> {
    if (!this.#authenticated || this.#closed) return;
    const next = this.#ops.shift();
    if (next === undefined) return;
    const batch = [...new Set(next.keys)].filter(
      (key) =>
        next.op === PriceSubscriptionOperation.Unsubscribe ||
        this.#keys.get(key.subscription.key) === key,
    );
    if (batch.length === 0) {
      this.#scheduleFlush();
      return;
    }
    const generation = this.#generation;
    this.#flushing = true;
    try {
      const rejections = await this.#connection.change(
        next.op,
        batch.map(({ subscription }) => subscription),
      );
      if (generation !== this.#generation || this.#closed) return;
      if (
        next.op === PriceSubscriptionOperation.Unsubscribe &&
        rejections.length > 0
      ) {
        const rejection = rejections[0];
        if (rejection !== undefined) throw rejection.error;
      }
      if (next.op === PriceSubscriptionOperation.Subscribe) {
        this.#scheduler.resetBackoff();
        const rejectedKeys = new Set(
          rejections.map((rejection) => rejection.key),
        );
        for (const key of batch) {
          if (rejectedKeys.has(key.subscription.key)) continue;
          key.subscribed = true;
          key.accepted = true;
          key.resolve();
        }
        for (const { key: rejectedKey, error } of rejections) {
          const key = batch.find(
            (item) => item.subscription.key === rejectedKey,
          );
          if (key !== undefined) this.#rejectKeys([key], error, false);
        }
      }
    } catch (error) {
      if (generation !== this.#generation || this.#closed) return;
      if (
        error instanceof RequestRejectedError &&
        next.op === PriceSubscriptionOperation.Subscribe
      ) {
        this.#rejectKeys(batch, error);
      } else {
        // Acceptance is uncertain after an ack timeout or send failure. A new
        // connection clears upstream state and replays the remaining keys.
        // Rejected unsubscriptions need the same cleanup for orphaned filters.
        await this.#restart(1006);
      }
    } finally {
      this.#flushing = false;
      this.#scheduleFlush();
    }
  }

  #event(event: PriceEvent): void {
    for (const state of this.#keys.values()) {
      const subscription = state.subscription;
      if (subscription.topic !== event.topic) continue;
      const payload = event.payload;
      if (payload.symbol.toLowerCase() !== subscription.symbol) continue;
      if (
        subscription.topic === 'prices.crypto.twap' &&
        (!('windowSeconds' in payload) ||
          payload.windowSeconds !== subscription.windowSeconds)
      )
        continue;
      state.snapshot = refreshSnapshot(state.snapshot, event);
      for (const listener of state.listeners) listener.event(event);
    }
  }

  #recordDrop(): void {
    const now = Date.now();
    if (now - this.#lastDropAt < 5_000) return;
    this.#keyTarget = Math.max(1, Math.floor(this.keyTarget / 2));
    this.#lastDropAt = now;
  }

  #reset(): void {
    this.#generation++;
    this.#authenticated = false;
    this.#ops = [];
    clearTimeout(this.#flushTimer);
    this.#flushTimer = undefined;
    for (const state of this.#keys.values()) {
      state.snapshot = undefined;
      if (!state.subscribed) continue;
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      void promise.catch(() => undefined);
      state.ready = promise;
      state.resolve = resolve;
      state.reject = reject;
      state.subscribed = false;
    }
  }

  #lost(info: WebSocketCloseInfo): void {
    const error = new ConnectionLostError('Realtime connection closed.', info);
    this.#reset();
    if (info.code === 4001 || info.code === 4008) this.#fail(error);
    else this.#schedule(info.code);
  }

  async #restart(code: number): Promise<void> {
    this.#restarting = true;
    this.#reset();
    try {
      await this.#connection.close();
    } finally {
      this.#restarting = false;
      this.#schedule(code);
    }
  }

  #schedule(code: number): void {
    this.#scheduler.schedule({
      delayPolicy: (attempt) => polyboltReconnectDelay(code, attempt),
      shouldReconnect: () => !this.#closed && this.#keys.size > 0,
      reconnect: () => this.#connect(),
    });
  }

  #fail(error: Error): void {
    // Ending one multi-key handle removes listeners from other keys. Snapshot
    // the fanout first so every handle still observes the terminal error.
    const states = [...this.#keys.values()];
    const listeners = new Set(states.flatMap((key) => [...key.listeners]));
    for (const key of states) key.reject(error);
    for (const listener of listeners) listener.end(error);
    void this.close();
  }

  #rejectKeys(keys: KeyState[], error: Error, unsubscribe = true): void {
    const current = keys.filter(
      (key) => this.#keys.get(key.subscription.key) === key,
    );
    // Listener teardown can remove several keys. Capture the fanout before
    // notifying anyone and never reject a replacement state for the same key.
    const listeners = new Set(current.flatMap((key) => [...key.listeners]));
    for (const key of current) {
      this.#keys.delete(key.subscription.key);
      key.reject(error);
    }
    if (unsubscribe && this.#authenticated)
      this.#enqueue(PriceSubscriptionOperation.Unsubscribe, current);
    for (const listener of listeners) listener.end(error);
    if (this.#keys.size === 0) {
      this.#idleTimer = setNonBlockingTimeout(() => {
        void this.close();
      }, 1_000);
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#scheduler.stop();
    clearTimeout(this.#idleTimer);
    const error = new TransportError('Realtime connection closed.');
    this.#reset();
    for (const key of this.#keys.values()) {
      key.reject(error);
    }
    this.#keys.clear();
    await this.#connection.close();
  }
}

function awaitAcceptance(ready: Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setNonBlockingTimeout(() => {
      reject(
        new TransportError(
          'Realtime subscription was not accepted within 30 seconds.',
        ),
      );
    }, 30_000);
    void ready.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// A handle joining a shared key needs current history, not the barrier from
// when the first handle connected. Maintain the same two-minute window locally.
function refreshSnapshot(
  previous: PriceEvent | undefined,
  event: PriceEvent,
): PriceEvent | undefined {
  if (event.type === 'subscribe') return event;
  const history = previous?.type === 'subscribe' ? previous.payload.data : [];
  const { symbol, timestamp, value } = event.payload;
  if ((history.at(-1)?.timestamp ?? 0) > timestamp) return previous;
  const data = [
    ...history.filter(
      (point) =>
        point.timestamp > timestamp - 120_000 && point.timestamp < timestamp,
    ),
    { timestamp, value },
  ];
  if (event.topic === 'prices.crypto.twap')
    return {
      ...event,
      type: 'subscribe',
      payload: { symbol, data, windowSeconds: event.payload.windowSeconds },
    };
  return { ...event, type: 'subscribe', payload: { symbol, data } };
}
