import { ApiKeyCredsSchema } from '@polymarket/bindings/clob';
import { ws } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { SubscriptionRejectedError, TransportError } from '../../errors';
import { PolyboltWebSocketHeartbeat } from '../heartbeat';
import { WebSocketConnection } from '../lifecycle';
import { RealtimeWebSocketManager } from './manager';
import { polyboltReconnectDelay, subscriptionsFor } from './protocol';

const url = 'wss://realtime.test/ws';
const link = ws.link(url);
const server = setupServer();
const credentials = ApiKeyCredsSchema.parse({
  apiKey: '00000000-0000-4000-8000-000000000001',
  secret: 'c2VjcmV0',
  passphrase: 'test',
});

describe('realtime timing boundaries', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => {
    server.resetHandlers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('bounds initial acceptance when acknowledgements never arrive', async () => {
    vi.useFakeTimers();
    const manager = new RealtimeWebSocketManager({
      url,
      credentials,
    });
    const ops: string[] = [];
    server.use(
      link.addEventListener('connection', ({ client }) => {
        client.addEventListener('message', ({ data }) => {
          const { op, rid } = JSON.parse(String(data));
          ops.push(op);
          if (op === 'auth') client.send(JSON.stringify({ op: 'authed', rid }));
        });
      }),
    );
    try {
      const pending = manager.subscribe({
        topic: 'prices.crypto',
        symbols: ['btcusd'],
      });
      const rejected = expect(pending).rejects.toBeInstanceOf(TransportError);
      await vi.waitFor(() => expect(ops).toContain('subscribe'));
      await vi.advanceTimersByTimeAsync(30_001);
      await rejected;
    } finally {
      await manager.close();
    }
  });

  it('rejects an initial connection failure instead of retrying an unreachable subscription forever', async () => {
    vi.useFakeTimers();
    const manager = new RealtimeWebSocketManager({
      url: 'not a websocket URL',
      credentials,
    });
    let failure: unknown;
    const pending = manager
      .subscribe({ topic: 'prices.crypto', symbols: ['btcusd'] })
      .catch((error: unknown) => {
        failure = error;
      });
    try {
      await vi.waitFor(() => expect(failure).toBeInstanceOf(TransportError));
      await pending;
    } finally {
      await manager.close();
    }
  });

  it('rejects a bad batch without ending an established sibling stream', async () => {
    vi.useFakeTimers();
    const manager = new RealtimeWebSocketManager({ url, credentials });
    let connections = 0;
    let publish = () => {};
    server.use(
      link.addEventListener('connection', ({ client }) => {
        connections++;
        publish = () => client.send(priceFrame('btcusd'));
        client.addEventListener('message', ({ data }) => {
          const frame = JSON.parse(String(data)) as ControlFrame;
          if (
            frame.op === 'subscribe' &&
            frame.subscriptions?.some((item) => item.filter.symbol === 'ethusd')
          ) {
            client.send(
              JSON.stringify({
                op: 'error',
                code: 'bad_filter',
                channel: 'price.crypto',
                rid: frame.rid,
              }),
            );
          } else acceptControl(client, frame);
        });
      }),
    );
    try {
      const initial = manager.subscribe({
        topic: 'prices.crypto',
        symbols: ['btcusd'],
      });
      await vi.waitFor(() => expect(connections).toBe(1));
      await vi.advanceTimersByTimeAsync(120);
      const handle = await initial;
      const next = handle[Symbol.asyncIterator]().next();
      void next.catch(() => undefined);
      const rejected = expect(
        manager.subscribe({ topic: 'prices.crypto', symbols: ['ethusd'] }),
      ).rejects.toBeInstanceOf(SubscriptionRejectedError);
      await vi.advanceTimersByTimeAsync(120);
      await rejected;
      publish();
      await expect(next).resolves.toMatchObject({
        done: false,
        value: { payload: { symbol: 'btcusd' } },
      });
      expect(connections).toBe(1);
    } finally {
      await manager.close();
    }
  });

  it('preserves an accepted sibling when a uniquely identified batch item is rejected', async () => {
    vi.useFakeTimers();
    const manager = new RealtimeWebSocketManager({ url, credentials });
    server.use(
      link.addEventListener('connection', ({ client }) => {
        client.addEventListener('message', ({ data }) => {
          const frame = JSON.parse(String(data)) as ControlFrame;
          if (frame.op !== 'subscribe') {
            acceptControl(client, frame);
            return;
          }
          for (const subscription of frame.subscriptions ?? [])
            client.send(
              JSON.stringify({
                op:
                  subscription.channel === 'price.crypto'
                    ? 'error'
                    : 'subscribed',
                code:
                  subscription.channel === 'price.crypto'
                    ? 'bad_filter'
                    : undefined,
                channel: subscription.channel,
                rid: frame.rid,
              }),
            );
        });
      }),
    );
    try {
      const rejected = manager.subscribe({
        topic: 'prices.crypto',
        symbols: ['unknown'],
      });
      const rejection = expect(rejected).rejects.toBeInstanceOf(
        SubscriptionRejectedError,
      );
      const accepted = manager.subscribe({
        topic: 'prices.polymarket',
        assetIds: ['1'],
      });
      await vi.advanceTimersByTimeAsync(120);
      await rejection;
      const handle = await accepted;
      await handle.close();
    } finally {
      await manager.close();
    }
  });

  it('subscribes to public BBO without sending authentication', async () => {
    vi.useFakeTimers();
    const manager = new RealtimeWebSocketManager({ url });
    const ops: string[] = [];
    server.use(
      link.addEventListener('connection', ({ client }) => {
        client.addEventListener('message', ({ data }) => {
          const frame = JSON.parse(String(data)) as ControlFrame;
          ops.push(frame.op);
          acceptControl(client, frame);
        });
      }),
    );
    try {
      const pending = manager.subscribe({
        topic: 'prices.polymarket',
        assetIds: ['1'],
      });
      await vi.advanceTimersByTimeAsync(120);
      const handle = await pending;
      expect(ops).not.toContain('auth');
      expect(ops).toContain('subscribe');
      await handle.close();
    } finally {
      await manager.close();
    }
  });

  it('replays the latest BBO as a snapshot to a shared late joiner', async () => {
    vi.useFakeTimers();
    const manager = new RealtimeWebSocketManager({ url, credentials });
    let publish = () => {};
    server.use(
      link.addEventListener('connection', ({ client }) => {
        publish = () => client.send(bboFrame('1'));
        client.addEventListener('message', ({ data }) =>
          acceptControl(client, JSON.parse(String(data)) as ControlFrame),
        );
      }),
    );
    try {
      const first = manager.subscribe({
        topic: 'prices.polymarket',
        assetIds: ['1'],
      });
      await vi.advanceTimersByTimeAsync(120);
      const firstHandle = await first;
      publish();
      await expect(
        firstHandle[Symbol.asyncIterator]().next(),
      ).resolves.toMatchObject({
        done: false,
        value: { topic: 'prices.polymarket', type: 'update' },
      });
      const joiningHandle = await manager.subscribe({
        topic: 'prices.polymarket',
        assetIds: ['1'],
      });
      await expect(
        joiningHandle[Symbol.asyncIterator]().next(),
      ).resolves.toMatchObject({
        done: false,
        value: {
          topic: 'prices.polymarket',
          type: 'subscribe',
          payload: { assetId: '1', bestBid: '0.4', bestAsk: '0.5' },
        },
      });
      await Promise.all([firstHandle.close(), joiningHandle.close()]);
    } finally {
      await manager.close();
    }
  });

  it('normalizes legacy Binance quote symbols to PolyBolt USD symbols', () => {
    expect(
      subscriptionsFor({
        topic: 'prices.crypto',
        symbols: ['BTC/USDT'],
      }),
    ).toEqual([
      expect.objectContaining({
        filter: { symbol: 'btcusd' },
        symbol: 'btcusd',
      }),
    ]);
  });

  it('rejects the unavailable 30-second TWAP series with a migration hint', async () => {
    const manager = new RealtimeWebSocketManager({ url, credentials });
    try {
      await expect(
        manager.subscribe({
          topic: 'prices.crypto.twap',
          symbols: ['btcusd'],
          windowSeconds: 30,
        } as never),
      ).rejects.toThrow('60-second');
    } finally {
      await manager.close();
    }
  });

  it.each([
    'ack timeout',
    'send failure',
  ] as const)('recovers from %s without ending sibling streams', async (failure) => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const manager = new RealtimeWebSocketManager({ url, credentials });
    let connections = 0;
    let failed = false;
    let publish = () => {};
    if (failure === 'send failure') {
      const send = WebSocketConnection.prototype.send;
      vi.spyOn(WebSocketConnection.prototype, 'send').mockImplementation(
        function (this: WebSocketConnection, message) {
          const frame = message as ControlFrame;
          if (
            !failed &&
            frame.op === 'subscribe' &&
            frame.subscriptions?.some((item) => item.filter.symbol === 'ethusd')
          ) {
            failed = true;
            return false;
          }
          return send.call(this, message);
        },
      );
    }
    server.use(
      link.addEventListener('connection', ({ client }) => {
        connections++;
        publish = () => client.send(priceFrame('btcusd'));
        client.addEventListener('message', ({ data }) => {
          const frame = JSON.parse(String(data)) as ControlFrame;
          if (
            failure === 'ack timeout' &&
            !failed &&
            frame.op === 'subscribe' &&
            frame.subscriptions?.some((item) => item.filter.symbol === 'ethusd')
          ) {
            failed = true;
            return;
          }
          acceptControl(client, frame);
        });
      }),
    );
    try {
      const initial = manager.subscribe({
        topic: 'prices.crypto',
        symbols: ['btcusd'],
      });
      await vi.waitFor(() => expect(connections).toBe(1));
      await vi.advanceTimersByTimeAsync(120);
      const handle = await initial;
      const next = handle[Symbol.asyncIterator]().next();
      void next.catch(() => undefined);
      const joining = manager.subscribe({
        topic: 'prices.crypto',
        symbols: ['ethusd'],
      });
      void joining.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(
        failure === 'ack timeout' ? 11_000 : 1_000,
      );
      await joining;
      publish();
      await expect(next).resolves.toMatchObject({
        done: false,
        value: { payload: { symbol: 'btcusd' } },
      });
      expect(connections).toBe(2);
    } finally {
      await manager.close();
    }
  });

  it('waits for restart teardown before connecting a joining subscription', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const manager = new RealtimeWebSocketManager({ url, credentials });
    const teardown = Promise.withResolvers<void>();
    const close = WebSocketConnection.prototype.close;
    let closing = false;
    vi.spyOn(WebSocketConnection.prototype, 'close').mockImplementationOnce(
      async function (this: WebSocketConnection) {
        closing = true;
        await close.call(this);
        await teardown.promise;
      },
    );
    let connections = 0;
    let auths = 0;
    server.use(
      link.addEventListener('connection', ({ client }) => {
        const connection = ++connections;
        client.addEventListener('message', ({ data }) => {
          const frame = JSON.parse(String(data)) as ControlFrame;
          if (frame.op === 'auth') auths++;
          if (connection === 1 && frame.op === 'subscribe') return;
          acceptControl(client, frame);
        });
      }),
    );
    try {
      const initial = manager.subscribe({
        topic: 'prices.crypto',
        symbols: ['btcusd'],
      });
      await vi.waitFor(() => expect(auths).toBe(1));
      await vi.advanceTimersByTimeAsync(10_200);
      expect(closing).toBe(true);
      const joining = manager.subscribe({
        topic: 'prices.crypto',
        symbols: ['ethusd'],
      });
      await vi.advanceTimersByTimeAsync(200);
      expect(connections).toBe(1);
      teardown.resolve();
      await vi.advanceTimersByTimeAsync(1_000);
      await Promise.all([initial, joining]);
      expect(connections).toBe(2);
      expect(auths).toBe(2);
    } finally {
      teardown.resolve();
      await manager.close();
    }
  });

  it('reopens after a drop during the last-key idle grace period', async () => {
    vi.useFakeTimers();
    const manager = new RealtimeWebSocketManager({ url, credentials });
    let connections = 0;
    let drop = () => {};
    server.use(
      link.addEventListener('connection', ({ client }) => {
        connections++;
        drop = () => client.close(4002);
        client.addEventListener('message', ({ data }) =>
          acceptControl(client, JSON.parse(String(data)) as ControlFrame),
        );
      }),
    );
    try {
      const initial = manager.subscribe({
        topic: 'prices.crypto',
        symbols: ['btcusd'],
      });
      await vi.waitFor(() => expect(connections).toBe(1));
      await vi.advanceTimersByTimeAsync(120);
      await (await initial).close();
      drop();
      await vi.advanceTimersByTimeAsync(0);
      let accepted = false;
      const joining = manager
        .subscribe({ topic: 'prices.crypto', symbols: ['ethusd'] })
        .then(() => {
          accepted = true;
        });
      await vi.waitFor(() => expect(accepted).toBe(true));
      await joining;
      expect(connections).toBe(2);
    } finally {
      await manager.close();
    }
  });

  it('waits for unsubscribe acceptance before resubscribing the same filter', async () => {
    vi.useFakeTimers();
    const manager = new RealtimeWebSocketManager({ url, credentials });
    let subscriptions = 0;
    let auths = 0;
    let release = () => {};
    server.use(
      link.addEventListener('connection', ({ client }) => {
        client.addEventListener('message', ({ data }) => {
          const frame = JSON.parse(String(data)) as ControlFrame;
          if (frame.op === 'auth') auths++;
          if (frame.op === 'subscribe') subscriptions++;
          if (frame.op === 'unsubscribe')
            release = () => acceptControl(client, frame);
          else acceptControl(client, frame);
        });
      }),
    );
    try {
      const initial = manager.subscribe({
        topic: 'prices.crypto',
        symbols: ['btcusd'],
      });
      await vi.waitFor(() => expect(auths).toBe(1));
      await vi.advanceTimersByTimeAsync(120);
      await (await initial).close();
      await vi.advanceTimersByTimeAsync(120);
      const joining = manager.subscribe({
        topic: 'prices.crypto',
        symbols: ['btcusd'],
      });
      await vi.advanceTimersByTimeAsync(120);
      expect(subscriptions).toBe(1);
      release();
      await vi.advanceTimersByTimeAsync(120);
      await joining;
      expect(subscriptions).toBe(2);
    } finally {
      await manager.close();
    }
  });

  it('uses the full connection capacity again after drop recovery stays quiet', async () => {
    vi.useFakeTimers();
    const manager = new RealtimeWebSocketManager({ url, credentials });
    let connections = 0;
    let drop = () => {};
    const operations: string[] = [];
    server.use(
      link.addEventListener('connection', ({ client }) => {
        connections++;
        drop = () =>
          client.send(
            JSON.stringify({
              v: 1,
              channel: 'price.crypto',
              seq: 1,
              ts: Date.now(),
              dropped: 1,
              payload: {},
            }),
          );
        client.addEventListener('message', ({ data }) => {
          const frame = JSON.parse(String(data)) as ControlFrame;
          operations.push(frame.op);
          acceptControl(client, frame);
        });
      }),
    );
    try {
      const initial = manager.subscribe({
        topic: 'prices.crypto',
        symbols: ['btcusd'],
      });
      await vi.waitFor(() => expect(connections).toBe(1));
      await vi.advanceTimersByTimeAsync(120);
      await initial;
      drop();
      await vi.advanceTimersByTimeAsync(120);
      expect(operations.filter((op) => op === 'subscribe')).toHaveLength(1);
      expect(operations).not.toContain('unsubscribe');
      await vi.advanceTimersByTimeAsync(60_001);
      const joining = manager.subscribe({
        topic: 'prices.polymarket',
        assetIds: Array.from({ length: 63 }, (_, index) => String(index + 1)),
      });
      await vi.advanceTimersByTimeAsync(120);
      await joining;
      expect(connections).toBe(1);
    } finally {
      await manager.close();
    }
  });

  it('uses draining jitter independently of the exponential retry count', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(polyboltReconnectDelay(4003, 0)).toBe(9990);
    expect(polyboltReconnectDelay(4003, 20)).toBe(9990);
    expect(polyboltReconnectDelay(4002, 0)).toBe(999);
    expect(polyboltReconnectDelay(1006, 20)).toBe(29970);
  });

  it('preserves backoff and awaits one authentication and fresh acceptance for shared keys after reconnect', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const manager = new RealtimeWebSocketManager({
      url,
      credentials,
    });
    let connections = 0;
    let auths = 0;
    let drop = () => {};
    let releaseAuth = () => {};
    server.use(
      link.addEventListener('connection', ({ client }) => {
        const connection = ++connections;
        drop = () => client.close(4002);
        client.addEventListener('message', ({ data }) => {
          const frame = JSON.parse(String(data)) as {
            op: string;
            rid: string;
            subscriptions?: { channel: string }[];
          };
          if (frame.op === 'auth') {
            auths++;
            const accept = () =>
              client.send(JSON.stringify({ op: 'authed', rid: frame.rid }));
            if (connection === 1) accept();
            else releaseAuth = accept;
          } else if (frame.op === 'subscribe' || frame.op === 'unsubscribe') {
            for (const subscription of frame.subscriptions ?? [])
              client.send(
                JSON.stringify({
                  op: frame.op === 'subscribe' ? 'subscribed' : 'unsubscribed',
                  channel: subscription.channel,
                  rid: frame.rid,
                }),
              );
          }
        });
      }),
    );
    try {
      const initial = manager.subscribe({
        topic: 'prices.crypto',
        symbols: ['btcusd'],
      });
      await vi.waitFor(() => expect(auths).toBe(1));
      await vi.advanceTimersByTimeAsync(120);
      await initial;
      drop();
      await vi.advanceTimersByTimeAsync(0);
      let settled = false;
      const joining = manager
        .subscribe({ topic: 'prices.crypto', symbols: ['btcusd'] })
        .then((handle) => {
          settled = true;
          return handle;
        });
      await vi.advanceTimersByTimeAsync(400);
      expect(settled).toBe(false);
      expect(connections).toBe(1);
      await vi.waitFor(() => expect(auths).toBe(2));
      const third = manager.subscribe({
        topic: 'prices.crypto',
        symbols: ['btcusd'],
      });
      await vi.advanceTimersByTimeAsync(200);
      expect(settled).toBe(false);
      expect(auths).toBe(2);
      releaseAuth();
      await vi.advanceTimersByTimeAsync(120);
      await Promise.all([joining, third]);
      expect(settled).toBe(true);
    } finally {
      await manager.close();
    }
  });

  it('sends protocol pings and treats any inbound frame as liveness', async () => {
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

type ControlFrame = {
  op: string;
  rid: string;
  subscriptions?: {
    channel: string;
    filter: { symbol?: string; asset_id?: string };
  }[];
};

function acceptControl(
  peer: { send(data: string): void },
  frame: ControlFrame,
): void {
  if (frame.op === 'auth' || frame.op === 'ping') {
    peer.send(
      JSON.stringify({
        op: frame.op === 'auth' ? 'authed' : 'pong',
        rid: frame.rid,
      }),
    );
  } else {
    for (const subscription of frame.subscriptions ?? [])
      peer.send(
        JSON.stringify({
          op: frame.op === 'subscribe' ? 'subscribed' : 'unsubscribed',
          channel: subscription.channel,
          rid: frame.rid,
        }),
      );
  }
}

function priceFrame(symbol: string): string {
  return JSON.stringify({
    v: 1,
    channel: 'price.crypto',
    seq: 1,
    ts: Date.now(),
    payload: {
      symbol,
      value: 1,
      full_accuracy_value: '1',
      timestamp: Date.now(),
    },
  });
}

function bboFrame(assetId: string): string {
  return JSON.stringify({
    v: 1,
    channel: 'price.polymarket',
    seq: 1,
    ts: Date.now(),
    payload: {
      market: `0x${'1'.repeat(64)}`,
      asset_id: assetId,
      best_bid: '0.4',
      best_ask: '0.5',
      hash: 'hash',
      timestamp: Date.now(),
    },
  });
}
