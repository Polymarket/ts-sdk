import type { ApiKeyCreds } from '@polymarket/bindings/clob';
import {
  PolyboltAckOp,
  PolyboltAckSchema,
  type PolyboltChannel,
  PolyboltEnvelopeSchema,
  type PriceEvent,
  parsePolyboltEvent,
  RealtimeErrorCode,
} from '@polymarket/bindings/subscriptions';
import { setNonBlockingTimeout } from '@polymarket/types';
import {
  ConnectionLostError,
  SubscriptionRejectedError,
  TransportError,
} from '../../errors';
import { PolyboltWebSocketHeartbeat } from '../heartbeat';
import {
  ReconnectScheduler,
  type WebSocketCloseInfo,
  WebSocketConnection,
} from '../lifecycle';
import { type PolyboltSubscription, polyboltReconnectDelay } from './protocol';

type KeyState = {
  subscription: PolyboltSubscription;
  listeners: Set<PriceListener>;
  ready: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
  subscribed: boolean;
  accepted: boolean;
  snapshot?: PriceEvent;
  lastResync: number;
};
export type PriceListener = {
  event: (event: PriceEvent) => void;
  end: (error: Error) => void;
};
type PendingOp = {
  op: PolyboltAckOp;
  channels: string[];
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
type QueuedOp = { op: 'subscribe' | 'unsubscribe'; keys: KeyState[] };
export type PolyboltSocketOptions = {
  url: string;
  headers?: Record<string, string>;
  credentials: ApiKeyCreds;
};

/** @internal One authenticated connection, with serialized rate-limited operations. */
export class PolyboltSocket {
  readonly #options: PolyboltSocketOptions;
  readonly #connection = new WebSocketConnection({
    heartbeat: new PolyboltWebSocketHeartbeat(),
    connectTimeoutMs: 10_000,
    closeTimeoutMs: 1_000,
  });
  readonly #scheduler = new ReconnectScheduler();
  readonly #keys = new Map<string, KeyState>();
  readonly #pending = new Map<string, PendingOp>();
  #ops: QueuedOp[] = [];
  #flushTimer: ReturnType<typeof setTimeout> | undefined;
  #idleTimer: ReturnType<typeof setTimeout> | undefined;
  #requestId = 0;
  #authenticated = false;
  #closed = false;
  #flushing = false;
  #restarting = false;
  #connecting: Promise<void> | undefined;
  #lastSent = 0;
  #generation = 0;
  #keyTarget = 64;
  #lastDropAt = Number.NEGATIVE_INFINITY;

  constructor(options: PolyboltSocketOptions) {
    this.#options = options;
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

  add(
    subscription: PolyboltSubscription,
    listener: PriceListener,
  ): Promise<void> {
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
        lastResync: Number.NEGATIVE_INFINITY,
      };
      this.#keys.set(subscription.key, state);
      if (this.#authenticated) this.#enqueue('subscribe', [state]);
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
    if (this.#authenticated) this.#enqueue('unsubscribe', [state]);
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
    await this.#connection.connect({
      url: this.#options.url,
      headers: this.#options.headers,
      onOpen: () => undefined,
      onError: () => undefined,
      onConnectionLost: (info) => this.#lost(info),
      onMessage: (message) => this.#message(message),
    });
    if (this.#closed || generation !== this.#generation) return;
    const { key, secret, passphrase } = this.#options.credentials;
    try {
      await this.#request(
        { op: 'auth', auth: { apiKey: key, secret, passphrase } },
        PolyboltAckOp.Authed,
        [],
      );
      if (this.#closed || generation !== this.#generation) return;
      this.#authenticated = true;
      this.#enqueue('subscribe', [...this.#keys.values()]);
    } catch (error) {
      if (this.#closed || generation !== this.#generation) return;
      if (
        error instanceof SubscriptionRejectedError &&
        error.code !== RealtimeErrorCode.AuthUnavailable
      ) {
        this.#fail(error);
      } else {
        await this.#restart(1006);
      }
    }
  }

  #enqueue(op: 'subscribe' | 'unsubscribe', keys: KeyState[]): void {
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
    // A leaky bucket with capacity one: at most 10 operation frames/s, auth included.
    this.#flushTimer = setNonBlockingTimeout(
      () => {
        this.#flushTimer = undefined;
        void this.#flush();
      },
      Math.max(10, 110 - (Date.now() - this.#lastSent)),
    );
  }

  async #flush(): Promise<void> {
    if (!this.#authenticated || this.#closed) return;
    const next = this.#ops.shift();
    if (next === undefined) return;
    const keys = [...new Set(next.keys)].filter(
      (key) =>
        next.op === 'unsubscribe' ||
        this.#keys.get(key.subscription.key) === key,
    );
    // Each validated filter is bounded; still split by encoded bytes for multibyte symbols.
    const batch: KeyState[] = [];
    while (keys.length > 0) {
      const candidate = keys[0];
      if (candidate === undefined) break;
      const frame = {
        op: next.op,
        subscriptions: [...batch, candidate].map((key) => ({
          channel: key.subscription.channel,
          filter: key.subscription.filter,
        })),
        rid: String(this.#requestId + 1),
      };
      if (
        batch.length > 0 &&
        new TextEncoder().encode(JSON.stringify(frame)).length > 60_000
      )
        break;
      batch.push(candidate);
      keys.shift();
    }
    if (keys.length > 0) this.#ops.unshift({ op: next.op, keys });
    if (batch.length === 0) {
      this.#scheduleFlush();
      return;
    }
    const generation = this.#generation;
    this.#flushing = true;
    try {
      await this.#request(
        {
          op: next.op,
          subscriptions: batch.map(({ subscription }) => ({
            channel: subscription.channel,
            filter: subscription.filter,
          })),
        },
        next.op === 'subscribe'
          ? PolyboltAckOp.Subscribed
          : PolyboltAckOp.Unsubscribed,
        batch.map(({ subscription }) => subscription.channel),
      );
      if (generation !== this.#generation || this.#closed) return;
      if (next.op === 'subscribe') {
        this.#scheduler.resetBackoff();
        for (const key of batch) {
          key.subscribed = true;
          key.accepted = true;
          key.resolve();
        }
      }
    } catch (error) {
      if (generation !== this.#generation || this.#closed) return;
      if (
        error instanceof SubscriptionRejectedError &&
        next.op === 'subscribe'
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

  #request(
    frame: object,
    op: PolyboltAckOp,
    channels: PolyboltChannel[],
  ): Promise<void> {
    const rid = String(++this.#requestId);
    return new Promise<void>((resolve, reject) => {
      const timer = setNonBlockingTimeout(() => {
        this.#pending.delete(rid);
        reject(
          new TransportError(
            'Realtime acknowledgement timed out after 10 seconds.',
          ),
        );
      }, 10_000);
      this.#pending.set(rid, {
        op,
        channels: [...channels],
        resolve,
        reject,
        timer,
      });
      this.#lastSent = Date.now();
      if (!this.#connection.send({ ...frame, rid })) {
        clearTimeout(timer);
        this.#pending.delete(rid);
        reject(new TransportError('Realtime connection is not open.'));
      }
    });
  }

  #message(message: unknown): void {
    const ack = PolyboltAckSchema.safeParse(message);
    if (ack.success) {
      const { op, rid, code, channel } = ack.data;
      const pending = rid === undefined ? undefined : this.#pending.get(rid);
      if (pending === undefined) return;
      if (op === PolyboltAckOp.Error && code !== undefined) {
        pending.reject(new SubscriptionRejectedError(code, channel));
      } else if (op === pending.op) {
        if (pending.channels.length > 0) {
          const index = pending.channels.indexOf(channel ?? '');
          if (index < 0) return;
          pending.channels.splice(index, 1);
          if (pending.channels.length > 0) return;
        }
        pending.resolve();
      } else return;
      clearTimeout(pending.timer);
      if (rid !== undefined) this.#pending.delete(rid);
      return;
    }
    const envelope = PolyboltEnvelopeSchema.safeParse(message);
    if (!envelope.success) return;
    const event = parsePolyboltEvent(envelope.data);
    if (event !== undefined) {
      for (const state of this.#keys.values()) {
        const { channel, filter } = state.subscription;
        if (channel !== envelope.data.channel) continue;
        const payload = event.payload;
        if ('asset_id' in filter) {
          if (!('assetId' in payload) || payload.assetId !== filter.asset_id)
            continue;
        } else {
          if (
            !('symbol' in payload) ||
            payload.symbol.toLowerCase() !== filter.symbol
          )
            continue;
          if (
            filter.window_seconds !== undefined &&
            (!('windowSeconds' in payload) ||
              payload.windowSeconds !== filter.window_seconds)
          )
            continue;
        }
        state.snapshot = refreshSnapshot(state.snapshot, event);
        for (const listener of state.listeners) listener.event(event);
      }
    }
    if ((envelope.data.dropped ?? 0) > 0) this.#resync(envelope.data.channel);
  }

  #resync(channel: PolyboltChannel): void {
    const now = Date.now();
    const keys = [...this.#keys.values()].filter(
      (key) =>
        key.subscription.channel === channel && now - key.lastResync >= 5_000,
    );
    if (keys.length === 0) return;
    for (const key of keys) key.lastResync = now;
    this.#keyTarget = Math.max(1, Math.floor(this.keyTarget / 2));
    this.#lastDropAt = now;
    this.#enqueue('unsubscribe', keys);
    this.#enqueue('subscribe', keys);
  }

  #reset(error: Error): void {
    this.#generation++;
    this.#authenticated = false;
    this.#ops = [];
    clearTimeout(this.#flushTimer);
    this.#flushTimer = undefined;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
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
    this.#reset(error);
    if (info.code === 4001 || info.code === 4008) this.#fail(error);
    else this.#schedule(info.code);
  }

  async #restart(code: number): Promise<void> {
    this.#restarting = true;
    this.#reset(new TransportError('Realtime connection restarting.'));
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

  #rejectKeys(keys: KeyState[], error: Error): void {
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
    if (this.#authenticated) this.#enqueue('unsubscribe', current);
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
    this.#reset(error);
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
  if (event.topic === 'prices.polymarket') return undefined;
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
