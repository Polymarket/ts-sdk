import { ApiKeyCredsSchema } from '@polymarket/bindings/clob';
import { PriceProvider, PriceSource } from '@polymarket/bindings/subscriptions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PriceSubscription } from '../../actions/subscriptions';
import { TransportError } from '../../errors';
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
  filter: { symbol: string; window_seconds?: number; provider?: PriceProvider };
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
  static servedProvider: (
    subscription: SentSubscription,
  ) => PriceSource | undefined = () => undefined;
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
        provider:
          op === 'subscribe'
            ? TestWebSocket.servedProvider(subscription)
            : undefined,
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
    TestWebSocket.servedProvider = () => undefined;
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
    'prices.equity',
    'prices.equity.twap',
  ] as const)('preserves %s pins and confirms fallback, late joins and rollout changes', async (topic) => {
    TestWebSocket.servedProvider = () => PriceSource.Chainlink;
    const onSubscribed = vi.fn();
    const spec = {
      topic,
      symbol: 'USDJPY',
      provider: PriceProvider.Pyth,
      onSubscribed,
    };
    const handle = await subscribe(spec);
    expect(onSubscribed).toHaveBeenCalledExactlyOnceWith({
      provider: PriceSource.Chainlink,
    });
    const old = TestWebSocket.connections[0];
    expect(
      old?.operations.find((op) => op.op === 'subscribe')?.subscriptions?.[0]
        ?.filter,
    ).toMatchObject({ symbol: 'usdjpy', provider: PriceProvider.Pyth });
    const joining = vi.fn();
    const second = await subscribe({ ...spec, onSubscribed: joining });
    expect(joining).toHaveBeenCalledExactlyOnceWith({
      provider: PriceSource.Chainlink,
    });
    expect(old?.operations.filter((op) => op.op === 'subscribe')).toHaveLength(
      1,
    );
    TestWebSocket.servedProvider = () => undefined;
    old?.disconnect();
    await vi.advanceTimersByTimeAsync(800);
    expect(onSubscribed).toHaveBeenLastCalledWith({ provider: undefined });
    expect(onSubscribed).toHaveBeenCalledTimes(2);
    const reopened = TestWebSocket.connections[1];
    expect(
      reopened?.operations.find((op) => op.op === 'subscribe')
        ?.subscriptions?.[0]?.filter.provider,
    ).toBe(PriceProvider.Pyth);
    await handle.close();
    await second.close();
    await vi.advanceTimersByTimeAsync(150);
    expect(
      reopened?.operations.find((op) => op.op === 'unsubscribe')
        ?.subscriptions?.[0]?.filter.provider,
    ).toBe(PriceProvider.Pyth);
  });

  it('isolates conflicting pins even when selection is disabled', async () => {
    const handles = [];
    for (const provider of [
      undefined,
      PriceProvider.Pyth,
      PriceProvider.Chainlink,
    ])
      handles.push(
        await subscribe({ topic: 'prices.equity', symbol: 'xauusd', provider }),
      );
    expect(TestWebSocket.connections).toHaveLength(3);
    const iterators = handles.map((handle) => handle[Symbol.asyncIterator]());
    const reads = iterators.map((iterator) => iterator.next());
    for (const [index, socket] of TestWebSocket.connections.entries())
      socket.receive({
        v: 1,
        channel: 'price.equity',
        seq: 1,
        ts: 123456,
        payload: {
          symbol: 'xauusd',
          timestamp: 123456,
          value: index + 1,
          full_accuracy_value: String(index + 1),
          source: 'chainlink',
        },
      });
    expect(
      (await Promise.all(reads)).map((read) => read.value?.payload.value),
    ).toEqual(['1', '2', '3']);
    await handles[0]?.close();
    await vi.advanceTimersByTimeAsync(150);
    expect(
      TestWebSocket.connections[1]?.operations.some(
        (op) => op.op === 'unsubscribe',
      ),
    ).toBe(false);
    expect(
      TestWebSocket.connections[2]?.operations.some(
        (op) => op.op === 'unsubscribe',
      ),
    ).toBe(false);
  });

  it('correlates same-channel batched acknowledgements before delivering snapshots', async () => {
    TestWebSocket.servedProvider = ({ filter }) =>
      filter.symbol === 'aapl' ? PriceSource.Massive : PriceSource.Chainlink;
    const first = vi.fn();
    const second = vi.fn();
    const pending = Promise.all([
      pool.subscribe({
        topic: 'prices.equity',
        symbol: 'aapl',
        onSubscribed: first,
      }),
      pool.subscribe({
        topic: 'prices.equity',
        symbol: 'xauusd',
        onSubscribed: second,
      }),
    ]);
    await vi.advanceTimersByTimeAsync(250);
    await pending;
    expect(TestWebSocket.connections).toHaveLength(1);
    expect(
      TestWebSocket.connections[0]?.operations.find(
        (op) => op.op === 'subscribe',
      )?.subscriptions,
    ).toHaveLength(2);
    expect(first).toHaveBeenCalledExactlyOnceWith({
      provider: PriceSource.Massive,
    });
    expect(second).toHaveBeenCalledExactlyOnceWith({
      provider: PriceSource.Chainlink,
    });
  });

  it('contains callback errors without closing a shared listener', async () => {
    const first = await subscribe({ topic: 'prices.equity', symbol: 'aapl' });
    await expect(
      pool.subscribe({
        topic: 'prices.equity',
        symbol: 'aapl',
        onSubscribed() {
          throw new Error('callback failed');
        },
      }),
    ).rejects.toBeInstanceOf(TransportError);
    await vi.advanceTimersByTimeAsync(150);
    const socket = TestWebSocket.connections[0];
    expect(socket?.operations.some((op) => op.op === 'unsubscribe')).toBe(
      false,
    );
    const next = first[Symbol.asyncIterator]().next();
    socket?.receive({
      v: 1,
      channel: 'price.equity',
      seq: 1,
      ts: 123456,
      payload: {
        symbol: 'aapl',
        timestamp: 123456,
        value: 12,
        full_accuracy_value: '12',
        source: 'massive',
      },
    });
    expect((await next).value).toMatchObject({
      payload: { source: PriceSource.Massive, value: '12' },
    });
  });

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
