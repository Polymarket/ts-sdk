import { ApiKeyCredsSchema } from '@polymarket/bindings/clob';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PriceSubscription } from '../../actions/subscriptions';
import { PolyboltWebSocketHeartbeat } from '../heartbeat';
import { SocketPool } from './pool';
import { polyboltReconnectDelay } from './protocol';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type SentSubscription = {
  channel: string;
  filter: { symbol: string; window_seconds?: number };
};
type SentOperation = {
  op: string;
  rid: string;
  subscriptions?: SentSubscription[];
};

// Controlled WebSocket boundary: real pool, session, request encoding and
// acknowledgement parsing run together without a metered connection.
class TestWebSocket extends EventTarget {
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static connections: TestWebSocket[] = [];
  readyState = 0;
  readonly operations: SentOperation[] = [];

  constructor() {
    super();
    TestWebSocket.connections.push(this);
    queueMicrotask(() => {
      this.readyState = TestWebSocket.OPEN;
      this.dispatchEvent(new Event('open'));
    });
  }

  send(data: string): void {
    const { op, rid, subscriptions } = JSON.parse(data) as SentOperation;
    this.operations.push({ op, rid, subscriptions });
    if (op === 'auth' || op === 'ping') {
      this.receive({ op: op === 'auth' ? 'authed' : 'pong', rid });
      return;
    }
    for (const subscription of subscriptions ?? [])
      this.receive({
        op: op === 'subscribe' ? 'subscribed' : 'unsubscribed',
        rid,
        channel: subscription.channel,
      });
  }

  receive(frame: object): void {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(frame) }),
    );
  }

  disconnect(): void {
    this.readyState = TestWebSocket.CLOSED;
    this.dispatchEvent(
      new CloseEvent('close', { code: 4002, reason: 'Slow consumer.' }),
    );
  }

  close(): void {
    this.readyState = TestWebSocket.CLOSED;
    this.dispatchEvent(new Event('close'));
  }
}

describe('price channel lifecycle', () => {
  let pool: SocketPool;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    TestWebSocket.connections = [];
    vi.stubGlobal('WebSocket', TestWebSocket);
    pool = new SocketPool({
      url: 'wss://example.test/prices',
      credentials: ApiKeyCredsSchema.parse({
        apiKey: 'test-key',
        secret: 'test-secret',
        passphrase: 'test-passphrase',
      }),
    });
  });
  afterEach(async () => {
    await pool.close();
    expect(
      TestWebSocket.connections.every(
        (socket) => socket.readyState === TestWebSocket.CLOSED,
      ),
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  async function subscribe(spec: PriceSubscription) {
    const pending = pool.subscribe(spec);
    await vi.advanceTimersByTimeAsync(250);
    return pending;
  }

  it.each([
    {
      spec: { topic: 'prices.crypto', symbols: ['btcusd'] },
      channel: 'price.crypto',
      filter: { symbol: 'btcusd' },
    },
    {
      spec: { topic: 'prices.crypto.twap', symbols: ['btcusd'] },
      channel: 'price.crypto.twap',
      filter: { symbol: 'btcusd', window_seconds: 60 },
    },
    {
      spec: { topic: 'prices.equity', symbol: 'nvda' },
      channel: 'price.equity',
      filter: { symbol: 'nvda' },
    },
    {
      spec: { topic: 'prices.equity.twap', symbol: 'UsDjPy' },
      channel: 'price.equity.twap',
      filter: { symbol: 'usdjpy', window_seconds: 60 },
    },
  ] as const)('preserves $spec.topic filters on subscribe, reconnect and unsubscribe', async ({
    channel,
    filter,
    spec,
  }) => {
    const handle = await subscribe(spec);
    const expected = [{ channel, filter }];
    const old = TestWebSocket.connections[0];
    expect(
      old?.operations.find((op) => op.op === 'subscribe')?.subscriptions,
    ).toEqual(expected);
    old?.receive({
      v: 1,
      channel,
      seq: 1,
      ts: 123456,
      payload: {
        ...filter,
        source: 'newvendor',
        timestamp: 123456,
        value: 123.45,
        full_accuracy_value: '123.450000000000000001',
      },
    });
    const update = await handle[Symbol.asyncIterator]().next();
    expect(update.value).toMatchObject({
      topic: spec.topic,
      type: 'update',
      payload: { source: 'newvendor', value: '123.450000000000000001' },
    });
    old?.disconnect();
    await vi.advanceTimersByTimeAsync(800);
    const reopened = TestWebSocket.connections[1];
    expect(
      reopened?.operations.find((op) => op.op === 'subscribe')?.subscriptions,
    ).toEqual(expected);
    await handle.close();
    await vi.advanceTimersByTimeAsync(150);
    expect(
      reopened?.operations.find((op) => op.op === 'unsubscribe')?.subscriptions,
    ).toEqual(expected);
  });
});
describe('price reconnect timing and heartbeat', () => {
  it('uses draining jitter independently of the exponential retry count', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(polyboltReconnectDelay(4003, 0)).toBe(9990);
    expect(polyboltReconnectDelay(4003, 20)).toBe(9990);
    expect(polyboltReconnectDelay(4002, 0)).toBe(999);
    expect(polyboltReconnectDelay(1006, 20)).toBe(29970);
  });
  it('sends protocol pings and treats any inbound message as liveness', async () => {
    vi.useFakeTimers();
    const heartbeat = new PolyboltWebSocketHeartbeat();
    const send = vi.fn();
    heartbeat.start(send);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(send).toHaveBeenCalledWith('{"op":"ping"}');
    heartbeat.handleMessage('{"op":"pong"}');
    await vi.advanceTimersByTimeAsync(89_999);
    expect(heartbeat.isStale(Date.now())).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(heartbeat.isStale(Date.now())).toBe(true);
    heartbeat.stop();
  });
});
