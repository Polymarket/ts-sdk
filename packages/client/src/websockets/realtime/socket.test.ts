import { ApiKeyCredsSchema } from '@polymarket/bindings/clob';
import {
  KnownPriceSource,
  PriceProvider,
} from '@polymarket/bindings/subscriptions';
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
  filter: { symbol: string; window_seconds?: number; provider?: string };
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
  ) => string | undefined = () => undefined;
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

  describe.each([
    undefined,
    PriceProvider.Pyth,
    PriceProvider.Chainlink,
  ])('requested provider %s', (provider) => {
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
      const handle = await subscribe({ ...spec, provider });
      const expected = [
        {
          channel,
          filter: {
            ...filter,
            ...(provider === undefined ? {} : { provider }),
          },
        },
      ];
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
        reopened?.operations.find((op) => op.op === 'unsubscribe')
          ?.subscriptions,
      ).toEqual(expected);
    });
  });

  it('shares a provider key until its last listener closes', async () => {
    const first = await subscribe({
      topic: 'prices.equity',
      symbol: 'NVDA',
      provider: PriceProvider.Pyth,
    });
    const second = await subscribe({
      topic: 'prices.equity',
      symbol: 'nvda',
      provider: PriceProvider.Pyth,
    });
    expect(TestWebSocket.connections).toHaveLength(1);
    const socket = TestWebSocket.connections[0];
    expect(
      socket?.operations.filter((op) => op.op === 'subscribe'),
    ).toHaveLength(1);
    socket?.receive(equityFrame('1'));
    for (const handle of [first, second])
      expect((await handle[Symbol.asyncIterator]().next()).value).toMatchObject(
        {
          payload: { symbol: 'nvda', value: '1' },
        },
      );
    await first.close();
    await vi.advanceTimersByTimeAsync(150);
    expect(
      socket?.operations.filter((op) => op.op === 'unsubscribe'),
    ).toHaveLength(0);
    await second.close();
    await vi.advanceTimersByTimeAsync(150);
    expect(
      socket?.operations.filter((op) => op.op === 'unsubscribe'),
    ).toHaveLength(1);
  });

  it.each([
    undefined,
    'chainlink',
    'future_provider',
  ])('isolates default and pinned streams when the served provider is %s', async (servedProvider) => {
    TestWebSocket.servedProvider = () => servedProvider;
    const handles = [];
    for (const provider of [
      undefined,
      PriceProvider.Pyth,
      PriceProvider.Chainlink,
    ])
      handles.push(
        await subscribe({ topic: 'prices.equity', symbol: 'nvda', provider }),
      );
    expect(TestWebSocket.connections).toHaveLength(3);
    // All sockets report the same actual source, including fallback. Routing
    // must follow the requested-provider connection, not the payload source.
    for (const [index, socket] of TestWebSocket.connections.entries())
      socket.receive(equityFrame(String(index + 1)));
    for (const [index, handle] of handles.entries())
      expect((await handle[Symbol.asyncIterator]().next()).value).toMatchObject(
        {
          payload: { source: 'chainlink', value: String(index + 1) },
        },
      );
    await handles[0]?.close();
    await vi.advanceTimersByTimeAsync(150);
    expect(
      TestWebSocket.connections[1]?.operations.filter(
        (op) => op.op === 'unsubscribe',
      ),
    ).toHaveLength(0);
    expect(
      TestWebSocket.connections[2]?.operations.filter(
        (op) => op.op === 'unsubscribe',
      ),
    ).toHaveLength(0);
    for (const socket of TestWebSocket.connections.slice(1))
      socket.disconnect();
    TestWebSocket.servedProvider = () =>
      servedProvider === undefined ? 'chainlink' : undefined;
    await vi.advanceTimersByTimeAsync(800);
    expect(
      TestWebSocket.connections
        .slice(3)
        .map(
          (socket) =>
            socket.operations.find((op) => op.op === 'subscribe')
              ?.subscriptions,
        ),
    ).toEqual([
      [
        {
          channel: 'price.equity',
          filter: { symbol: 'nvda', provider: 'pyth' },
        },
      ],
      [
        {
          channel: 'price.equity',
          filter: { symbol: 'nvda', provider: 'chainlink' },
        },
      ],
    ]);
  });

  it('retains provider groups while idle, reuses matching groups, and ignores old-group frames', async () => {
    const first = await subscribe({
      topic: 'prices.equity',
      symbol: 'nvda',
      provider: PriceProvider.Pyth,
    });
    const old = TestWebSocket.connections[0];
    await first.close();
    await vi.advanceTimersByTimeAsync(150);
    const different = await subscribe({
      topic: 'prices.equity',
      symbol: 'nvda',
      provider: PriceProvider.Chainlink,
    });
    expect(TestWebSocket.connections).toHaveLength(2);
    // A completed unsubscribe is not a fence against old frames already queued
    // by the server. An idle socket must not acquire a different provider group.
    old?.receive(equityFrame('1'));
    TestWebSocket.connections[1]?.receive(equityFrame('2'));
    expect(
      (await different[Symbol.asyncIterator]().next()).value,
    ).toMatchObject({ payload: { value: '2' } });
    await subscribe({
      topic: 'prices.equity',
      symbol: 'nvda',
      provider: PriceProvider.Pyth,
    });
    expect(TestWebSocket.connections).toHaveLength(2);
    expect(old?.operations.filter((op) => op.op === 'subscribe')).toHaveLength(
      2,
    );
    old?.disconnect();
    await vi.advanceTimersByTimeAsync(800);
    expect(
      TestWebSocket.connections[2]?.operations.find(
        (op) => op.op === 'subscribe',
      )?.subscriptions,
    ).toEqual([
      { channel: 'price.equity', filter: { symbol: 'nvda', provider: 'pyth' } },
    ]);
  });

  it.each([
    'prices.equity',
    'prices.equity.twap',
  ] as const)('confirms %s fallback, late joins and rollout changes while keeping the pin', async (topic) => {
    TestWebSocket.servedProvider = () => KnownPriceSource.Chainlink;
    const onSubscribed = vi.fn();
    const spec = {
      topic,
      symbol: 'USDJPY',
      provider: PriceProvider.Pyth,
      onSubscribed,
    };
    const handle = await subscribe(spec);
    expect(onSubscribed).toHaveBeenCalledExactlyOnceWith({
      symbol: 'usdjpy',
      provider: KnownPriceSource.Chainlink,
    });
    const old = TestWebSocket.connections[0];
    expect(
      old?.operations.find((op) => op.op === 'subscribe')?.subscriptions?.[0]
        ?.filter,
    ).toMatchObject({ symbol: 'usdjpy', provider: PriceProvider.Pyth });
    const joining = vi.fn();
    const second = await subscribe({ ...spec, onSubscribed: joining });
    expect(joining).toHaveBeenCalledExactlyOnceWith({
      symbol: 'usdjpy',
      provider: KnownPriceSource.Chainlink,
    });
    expect(old?.operations.filter((op) => op.op === 'subscribe')).toHaveLength(
      1,
    );
    TestWebSocket.servedProvider = () => undefined;
    old?.disconnect();
    await vi.advanceTimersByTimeAsync(800);
    expect(onSubscribed).toHaveBeenLastCalledWith({
      symbol: 'usdjpy',
      provider: undefined,
    });
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

  it('correlates same-channel batched acknowledgements before confirming', async () => {
    TestWebSocket.servedProvider = ({ filter }) =>
      filter.symbol === 'aapl'
        ? KnownPriceSource.Massive
        : KnownPriceSource.Chainlink;
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
      symbol: 'aapl',
      provider: KnownPriceSource.Massive,
    });
    expect(second).toHaveBeenCalledExactlyOnceWith({
      symbol: 'xauusd',
      provider: KnownPriceSource.Chainlink,
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
      payload: { source: KnownPriceSource.Massive, value: '12' },
    });
  });

  it('contains a throwing late-join callback in a multi-symbol request without orphaned rejections', async () => {
    const first = await subscribe({
      topic: 'prices.crypto',
      symbols: ['btcusd'],
    });
    // The cached btcusd confirmation calls back synchronously inside subscribe,
    // while ethusd is still pending and solusd has not been requested yet.
    const failing = expect(
      pool.subscribe({
        topic: 'prices.crypto',
        symbols: ['ethusd', 'btcusd', 'solusd'],
        onSubscribed() {
          throw new Error('callback failed');
        },
      }),
    ).rejects.toBeInstanceOf(TransportError);
    await vi.advanceTimersByTimeAsync(250);
    await failing;
    // An orphaned rejection here would fail the run as an unhandled error.
    await vi.advanceTimersByTimeAsync(200);
    const socket = TestWebSocket.connections[0];
    expect(
      socket?.operations
        .filter((op) => op.op === 'unsubscribe')
        .flatMap((op) => op.subscriptions ?? [])
        .map((subscription) => subscription.filter.symbol),
    ).toEqual(['ethusd']);
    // The shared btcusd listener that did not fail keeps receiving frames.
    const next = first[Symbol.asyncIterator]().next();
    socket?.receive({
      v: 1,
      channel: 'price.crypto',
      seq: 1,
      ts: 123456,
      payload: {
        symbol: 'btcusd',
        source: 'pyth',
        timestamp: 123456,
        value: 7,
        full_accuracy_value: '7',
      },
    });
    expect((await next).value).toMatchObject({ payload: { value: '7' } });
  });

  it('ends the handle when an async callback rejects', async () => {
    // The rejection lands a microtask after the acknowledgement, so it may end
    // either the pending subscribe or the returned handle; both must surface it.
    const attempt = pool
      .subscribe({
        topic: 'prices.crypto',
        symbols: ['btcusd'],
        async onSubscribed() {
          throw new Error('async callback failed');
        },
      })
      .then((handle) => handle[Symbol.asyncIterator]().next());
    const failing = expect(attempt).rejects.toBeInstanceOf(TransportError);
    await vi.advanceTimersByTimeAsync(250);
    await failing;
  });

  it('shares a connection for different symbols requesting the same provider', async () => {
    await subscribe({
      topic: 'prices.equity',
      symbol: 'nvda',
      provider: PriceProvider.Pyth,
    });
    await subscribe({
      topic: 'prices.equity',
      symbol: 'aapl',
      provider: PriceProvider.Pyth,
    });
    expect(TestWebSocket.connections).toHaveLength(1);
    expect(
      TestWebSocket.connections[0]?.operations
        .filter((op) => op.op === 'subscribe')
        .flatMap((op) => op.subscriptions ?? []),
    ).toEqual([
      { channel: 'price.equity', filter: { symbol: 'nvda', provider: 'pyth' } },
      { channel: 'price.equity', filter: { symbol: 'aapl', provider: 'pyth' } },
    ]);
  });
});

function equityFrame(value: string) {
  return {
    v: 1,
    channel: 'price.equity',
    seq: 1,
    ts: 123456,
    payload: {
      symbol: 'nvda',
      source: 'chainlink',
      timestamp: 123456,
      value,
      full_accuracy_value: value,
    },
  };
}
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
