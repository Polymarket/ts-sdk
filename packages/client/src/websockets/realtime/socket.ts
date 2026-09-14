import type { ApiKeyCreds } from '@polymarket/bindings/clob';
import {
  PolyboltAckOp,
  PolyboltAckSchema,
  PolyboltChannel,
  PolyboltEnvelopeSchema,
  type PolyboltSubscription,
  parsePolyboltEvent,
} from '@polymarket/bindings/subscriptions';
import { setNonBlockingTimeout } from '@polymarket/types';
import {
  ConnectionLostError,
  SubscriptionRejectedError,
  TransportError,
} from '../../errors';
import { PolyboltWebSocketHeartbeat } from '../heartbeat';
import { WebSocketConnection } from '../lifecycle';
import type { PriceKey } from './protocol';
import {
  type PriceSessionConnection,
  type PriceSessionEvents,
  PriceSubscriptionOperation,
  type PriceSubscriptionRejection,
} from './session';

type PendingRejection = { index: number; error: SubscriptionRejectedError };
type PendingOp = {
  op: PolyboltAckOp;
  channels: (string | undefined)[];
  rejections: PendingRejection[];
  resolve: (rejections: PendingRejection[]) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  sendTimer?: ReturnType<typeof setTimeout>;
};
export type PolyboltConnectionOptions = {
  url: string;
  headers?: Record<string, string>;
  credentials?: ApiKeyCreds;
};

/** @internal Adapts price operations and events to the PolyBolt wire protocol. */
export class PolyboltConnection implements PriceSessionConnection {
  readonly #options: PolyboltConnectionOptions;
  readonly #connection = new WebSocketConnection({
    heartbeat: new PolyboltWebSocketHeartbeat(),
    connectTimeoutMs: 10_000,
    closeTimeoutMs: 1_000,
  });
  readonly #pending = new Map<string, PendingOp>();
  #events: PriceSessionEvents | undefined;
  #requestId = 0;
  #lastSent = 0;
  #generation = 0;

  constructor(options: PolyboltConnectionOptions) {
    this.#options = options;
  }

  async open(events: PriceSessionEvents): Promise<void> {
    this.#events = events;
    const generation = this.#generation;
    await this.#connection.connect({
      url: this.#options.url,
      headers: this.#options.headers,
      onOpen: () => undefined,
      onError: () => undefined,
      onConnectionLost: (info) => {
        if (generation !== this.#generation) return;
        this.#cancel(
          new ConnectionLostError('Realtime connection closed.', info),
        );
        events.disconnected(info);
      },
      onMessage: (message) => {
        if (generation === this.#generation) this.#message(message);
      },
    });
  }

  async authorize(): Promise<void> {
    const credentials = this.#options.credentials;
    if (credentials === undefined) return;
    const { key, secret, passphrase } = credentials;
    await this.#request(
      { op: 'auth', auth: { apiKey: key, secret, passphrase } },
      PolyboltAckOp.Authed,
      [],
    );
  }

  async change(
    operation: PriceSubscriptionOperation,
    subscriptions: readonly PriceKey[],
  ): Promise<PriceSubscriptionRejection[]> {
    const rejected: PriceSubscriptionRejection[] = [];
    let offset = 0;
    while (offset < subscriptions.length) {
      const batch: PolyboltSubscription[] = [];
      while (offset + batch.length < subscriptions.length) {
        const subscription = subscriptions[offset + batch.length];
        if (subscription === undefined) break;
        const candidate = toWireSubscription(subscription);
        const frame = {
          op: operation,
          subscriptions: [...batch, candidate],
          rid: String(this.#requestId + 1),
        };
        if (
          batch.length > 0 &&
          new TextEncoder().encode(JSON.stringify(frame)).length > 60_000
        )
          break;
        batch.push(candidate);
      }
      const rejections = await this.#request(
        { op: operation, subscriptions: batch },
        operation === PriceSubscriptionOperation.Subscribe
          ? PolyboltAckOp.Subscribed
          : PolyboltAckOp.Unsubscribed,
        batch.map(({ channel }) => channel),
      );
      for (const { index, error } of rejections) {
        const subscription = subscriptions[offset + index];
        if (subscription !== undefined)
          rejected.push({ key: subscription.key, error });
      }
      offset += batch.length;
    }
    return rejected;
  }

  #request(
    frame: object,
    op: PolyboltAckOp,
    channels: PolyboltChannel[],
  ): Promise<PendingRejection[]> {
    const rid = String(++this.#requestId);
    return new Promise((resolve, reject) => {
      const pending: PendingOp = {
        op,
        channels: [...channels],
        rejections: [],
        resolve,
        reject,
      };
      this.#pending.set(rid, pending);
      // Capacity-one pacing covers authentication and every operation frame.
      pending.sendTimer = setNonBlockingTimeout(
        () => {
          pending.timer = setNonBlockingTimeout(() => {
            this.#pending.delete(rid);
            reject(
              new TransportError(
                'Realtime acknowledgement timed out after 10 seconds.',
              ),
            );
          }, 10_000);
          this.#lastSent = Date.now();
          try {
            if (!this.#connection.send({ ...frame, rid }))
              throw new TransportError('Realtime connection is not open.');
          } catch (cause) {
            clearTimeout(pending.timer);
            this.#pending.delete(rid);
            reject(TransportError.fromError(cause));
          }
        },
        Math.max(0, 110 - (Date.now() - this.#lastSent)),
      );
    });
  }

  #message(message: unknown): void {
    const ack = PolyboltAckSchema.safeParse(message);
    if (ack.success) {
      const { op, rid, code, channel } = ack.data;
      const pending = rid === undefined ? undefined : this.#pending.get(rid);
      if (pending === undefined) return;
      if (op === PolyboltAckOp.Error && code !== undefined) {
        const error = new SubscriptionRejectedError(code, channel);
        const matches = pending.channels.flatMap((pendingChannel, index) =>
          pendingChannel === channel ? [index] : [],
        );
        if (channel === undefined || matches.length !== 1) {
          pending.reject(error);
        } else {
          const index = matches[0];
          if (index === undefined) return;
          pending.channels[index] = undefined;
          pending.rejections.push({ index, error });
          if (
            pending.channels.some(
              (pendingChannel) => pendingChannel !== undefined,
            )
          )
            return;
          pending.resolve(pending.rejections);
        }
      } else if (op === pending.op) {
        if (pending.channels.length > 0) {
          const index = pending.channels.indexOf(channel ?? '');
          if (index < 0) return;
          pending.channels[index] = undefined;
          if (
            pending.channels.some(
              (pendingChannel) => pendingChannel !== undefined,
            )
          )
            return;
        }
        pending.resolve(pending.rejections);
      } else return;
      clearTimeout(pending.timer);
      if (rid !== undefined) this.#pending.delete(rid);
      return;
    }
    const envelope = PolyboltEnvelopeSchema.safeParse(message);
    if (!envelope.success) return;
    const event = parsePolyboltEvent(envelope.data);
    if (event !== undefined) this.#events?.event(event);
    if ((envelope.data.dropped ?? 0) > 0) this.#events?.dropped();
  }

  #cancel(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.sendTimer);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  async close(): Promise<void> {
    this.#generation++;
    this.#events = undefined;
    this.#cancel(new TransportError('Realtime connection closed.'));
    await this.#connection.close();
  }
}

function toWireSubscription(subscription: PriceKey): PolyboltSubscription {
  switch (subscription.topic) {
    case 'prices.crypto':
      return {
        channel: PolyboltChannel.Crypto,
        filter: { symbol: subscription.symbol },
      };
    case 'prices.crypto.twap':
      return {
        channel: PolyboltChannel.Twap,
        filter: {
          symbol: subscription.symbol,
          window_seconds: subscription.windowSeconds,
        },
      };
    case 'prices.equity':
      return {
        channel: PolyboltChannel.Equity,
        filter: { symbol: subscription.symbol },
      };
    case 'prices.polymarket':
      return {
        channel: PolyboltChannel.Polymarket,
        filter: { asset_id: subscription.assetId },
      };
  }
}
