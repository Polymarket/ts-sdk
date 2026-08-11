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
import { production } from '../environments';
import { RtdsWebSocketManager } from './rtds';
import {
  captureConnection,
  collectFrames,
  expectDropsUnknownFrame,
  waitForNextEvent,
} from './testing';

const rtds = ws.link(production.rtds.ws);
const server = setupServer();
const manager = new RtdsWebSocketManager({ url: production.rtds.ws });

type RawTwapTopic = 'crypto_prices_twap_thirty' | 'crypto_prices_twap_sixty';

function twapFrame(options: {
  symbol?: string;
  topic: RawTwapTopic;
  windowSeconds: 30 | 60;
}): unknown {
  return {
    payload: {
      symbol: options.symbol ?? 'btc/usd',
      value: 65_000.12345678901,
      full_accuracy_value: '65000123456789012345678',
      timestamp: 1_772_752_581_815,
      window_s: options.windowSeconds,
    },
    timestamp: 1_772_752_582_004,
    topic: options.topic,
    type: 'update',
  };
}

describe('RtdsWebSocketManager', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
  });

  afterEach(async () => {
    await manager.close();
    server.resetHandlers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    server.close();
  });

  it('fans out independent filters on the same shared socket', async () => {
    const connection = captureConnection(server, rtds);

    const btcHandle = await manager.subscribe({
      topic: 'prices.crypto.binance',
      symbols: ['btcusdt'],
    });
    const ethHandle = await manager.subscribe({
      topic: 'prices.crypto.binance',
      symbols: ['ethusdt'],
    });
    const btcNext = waitForNextEvent(btcHandle);
    const ethNext = waitForNextEvent(ethHandle);

    await connection.send({
      payload: { symbol: 'btcusdt', timestamp: 1, value: 100 },
      timestamp: 1,
      topic: 'crypto_prices',
      type: 'update',
    });
    await connection.send({
      payload: { symbol: 'ethusdt', timestamp: 2, value: 200 },
      timestamp: 2,
      topic: 'crypto_prices',
      type: 'update',
    });

    await expect(btcNext).resolves.toMatchObject({
      done: false,
      value: {
        payload: { symbol: 'btcusdt', value: '100' },
        topic: 'prices.crypto.binance',
        type: 'update',
      },
    });
    await expect(ethNext).resolves.toMatchObject({
      done: false,
      value: {
        payload: { symbol: 'ethusdt', value: '200' },
        topic: 'prices.crypto.binance',
        type: 'update',
      },
    });
  });

  it('routes and isolates both Chainlink TWAP windows', async () => {
    const connection = captureConnection(server, rtds);
    const frames = collectFrames(server, rtds);

    const thirtySecondHandle = await manager.subscribe({
      topic: 'prices.crypto.chainlink.twap',
      windowSeconds: 30,
      symbols: ['btc/usd'],
    });
    const sixtySecondHandle = await manager.subscribe({
      topic: 'prices.crypto.chainlink.twap',
      windowSeconds: 60,
      symbols: ['btc/usd'],
    });

    await vi.waitFor(() => {
      expect(frames).toEqual([
        {
          action: 'subscribe',
          subscriptions: [
            { topic: 'crypto_prices_twap_thirty', type: 'update' },
          ],
        },
        {
          action: 'subscribe',
          subscriptions: [
            { topic: 'crypto_prices_twap_sixty', type: 'update' },
          ],
        },
      ]);
    });

    const thirtySecondNext = waitForNextEvent(thirtySecondHandle);
    const sixtySecondNext = waitForNextEvent(sixtySecondHandle);

    await connection.send(
      twapFrame({
        topic: 'crypto_prices_twap_thirty',
        windowSeconds: 30,
      }),
    );
    await expect(thirtySecondNext).resolves.toMatchObject({
      done: false,
      value: {
        payload: {
          symbol: 'btc/usd',
          value: '65000.123456789012345678',
          windowSeconds: 30,
        },
        topic: 'prices.crypto.chainlink.twap',
        type: 'update',
      },
    });

    await connection.send(
      twapFrame({
        topic: 'crypto_prices_twap_sixty',
        windowSeconds: 60,
      }),
    );
    await expect(sixtySecondNext).resolves.toMatchObject({
      done: false,
      value: {
        payload: {
          symbol: 'btc/usd',
          value: '65000.123456789012345678',
          windowSeconds: 60,
        },
        topic: 'prices.crypto.chainlink.twap',
        type: 'update',
      },
    });

    frames.length = 0;
    await thirtySecondHandle.close();
    expect(frames).toEqual([
      {
        action: 'unsubscribe',
        subscriptions: [{ topic: 'crypto_prices_twap_thirty', type: 'update' }],
      },
    ]);

    frames.length = 0;
    await sixtySecondHandle.close();
    expect(frames).toEqual([
      {
        action: 'unsubscribe',
        subscriptions: [{ topic: 'crypto_prices_twap_sixty', type: 'update' }],
      },
    ]);
  });

  it('shares a TWAP window while filtering symbols independently', async () => {
    const connection = captureConnection(server, rtds);
    const frames = collectFrames(server, rtds);

    const btcHandle = await manager.subscribe({
      topic: 'prices.crypto.chainlink.twap',
      windowSeconds: 30,
      symbols: ['btc/usd'],
    });
    const ethHandle = await manager.subscribe({
      topic: 'prices.crypto.chainlink.twap',
      windowSeconds: 30,
      symbols: ['eth/usd'],
    });

    await vi.waitFor(() => {
      expect(frames).toEqual([
        {
          action: 'subscribe',
          subscriptions: [
            { topic: 'crypto_prices_twap_thirty', type: 'update' },
          ],
        },
      ]);
    });

    const btcNext = waitForNextEvent(btcHandle);
    const ethNext = waitForNextEvent(ethHandle);
    await connection.send(
      twapFrame({
        symbol: 'btc/usd',
        topic: 'crypto_prices_twap_thirty',
        windowSeconds: 30,
      }),
    );
    await connection.send(
      twapFrame({
        symbol: 'eth/usd',
        topic: 'crypto_prices_twap_thirty',
        windowSeconds: 30,
      }),
    );

    await expect(btcNext).resolves.toMatchObject({
      value: { payload: { symbol: 'btc/usd', windowSeconds: 30 } },
    });
    await expect(ethNext).resolves.toMatchObject({
      value: { payload: { symbol: 'eth/usd', windowSeconds: 30 } },
    });

    frames.length = 0;
    await btcHandle.close();
    expect(frames).toEqual([]);

    await ethHandle.close();
    expect(frames).toEqual([
      {
        action: 'unsubscribe',
        subscriptions: [{ topic: 'crypto_prices_twap_thirty', type: 'update' }],
      },
    ]);
  });

  it('drops mismatched TWAP frames without closing the shared socket', async () => {
    await expectDropsUnknownFrame({
      expectedEvent: {
        payload: { symbol: 'btc/usd', windowSeconds: 30 },
        topic: 'prices.crypto.chainlink.twap',
        type: 'update',
      },
      link: rtds,
      server,
      subscribe: async () => {
        const observedManager = new RtdsWebSocketManager({
          url: production.rtds.ws,
        });
        const events = await observedManager.subscribe({
          topic: 'prices.crypto.chainlink.twap',
          windowSeconds: 30,
          symbols: ['btc/usd'],
        });
        return { close: () => observedManager.close(), events };
      },
      unknownFrame: twapFrame({
        topic: 'crypto_prices_twap_thirty',
        windowSeconds: 60,
      }),
      validFrame: twapFrame({
        topic: 'crypto_prices_twap_thirty',
        windowSeconds: 30,
      }),
    });
  });

  it('drops unknown frames without closing the shared socket', async () => {
    await expectDropsUnknownFrame({
      expectedEvent: { topic: 'prices.crypto.binance', type: 'update' },
      link: rtds,
      server,
      subscribe: async () => {
        const observedManager = new RtdsWebSocketManager({
          url: production.rtds.ws,
        });
        const events = await observedManager.subscribe({
          topic: 'prices.crypto.binance',
          symbols: ['btcusdt'],
        });
        return { close: () => observedManager.close(), events };
      },
      unknownFrame: {
        payload: { hello: 'world' },
        timestamp: 1,
        topic: 'future_topic',
        type: 'update',
      },
      validFrame: {
        payload: { symbol: 'btcusdt', timestamp: 1, value: 100 },
        timestamp: 1,
        topic: 'crypto_prices',
        type: 'update',
      },
    });
  });

  it('sends PING heartbeats while subscribed', { timeout: 5_000 }, async () => {
    const frames: string[] = [];

    server.use(
      rtds.addEventListener('connection', ({ client }) => {
        client.addEventListener('message', (event) => {
          frames.push(String(event.data));
        });
      }),
    );

    vi.useFakeTimers();

    await manager.subscribe({
      topic: 'prices.crypto.binance',
      symbols: ['btcusdt'],
    });

    await vi.advanceTimersByTimeAsync(5_000);

    expect(frames).toContain('PING');
  });

  it('ends active iterators when the manager closes', async () => {
    const handle = await manager.subscribe({
      topic: 'prices.crypto.binance',
      symbols: ['btcusdt'],
    });
    const next = waitForNextEvent(handle);

    await manager.close();

    await expect(next).resolves.toMatchObject({ done: true });
  });

  it('unsubscribes from a server entry only after the last subscription closes', async () => {
    const frames = collectFrames(server, rtds);

    const btcHandle = await manager.subscribe({
      topic: 'prices.crypto.binance',
      symbols: ['btcusdt'],
    });
    const ethHandle = await manager.subscribe({
      topic: 'prices.crypto.binance',
      symbols: ['ethusdt'],
    });

    await vi.waitFor(() => {
      expect(frames).toEqual([
        {
          action: 'subscribe',
          subscriptions: [{ topic: 'crypto_prices', type: 'update' }],
        },
      ]);
    });

    frames.length = 0;
    await btcHandle.close();
    expect(frames).toEqual([]);

    frames.length = 0;
    await ethHandle.close();
    expect(frames).toEqual([
      {
        action: 'unsubscribe',
        subscriptions: [{ topic: 'crypto_prices', type: 'update' }],
      },
    ]);
  });

  it('unsubscribes only the unshared server entry for overlapping comments subscriptions', async () => {
    const frames = collectFrames(server, rtds);

    const mixedHandle = await manager.subscribe({
      topic: 'comments',
      types: ['comment_created', 'reaction_created'],
    });
    await manager.subscribe({ topic: 'comments', types: ['reaction_created'] });

    await vi.waitFor(() => {
      expect(frames).toEqual([
        {
          action: 'subscribe',
          subscriptions: [
            { topic: 'comments', type: 'comment_created' },
            { topic: 'comments', type: 'reaction_created' },
          ],
        },
      ]);
    });

    frames.length = 0;
    await mixedHandle.close();
    expect(frames).toEqual([
      {
        action: 'unsubscribe',
        subscriptions: [{ topic: 'comments', type: 'comment_created' }],
      },
    ]);
  });

  it('reconnects and resubscribes active server entries after an unexpected close', {
    timeout: 5_000,
  }, async () => {
    const connectionFrames: unknown[][] = [];
    let firstClient: { close: () => void } | undefined;
    let secondClient: { send: (data: string) => void } | undefined;

    server.use(
      rtds.addEventListener('connection', ({ client }) => {
        const frames: unknown[] = [];
        connectionFrames.push(frames);
        if (connectionFrames.length === 1) firstClient = client;
        if (connectionFrames.length === 2) secondClient = client;
        client.addEventListener('message', (event) => {
          frames.push(JSON.parse(String(event.data)));
        });
      }),
    );

    vi.useFakeTimers();

    const handle = await manager.subscribe({
      topic: 'prices.crypto.binance',
      symbols: ['btcusdt'],
    });
    const next = waitForNextEvent(handle);

    await vi.waitFor(() => {
      expect(connectionFrames[0] ?? []).toEqual([
        {
          action: 'subscribe',
          subscriptions: [{ topic: 'crypto_prices', type: 'update' }],
        },
      ]);
    });

    firstClient?.close();
    await vi.advanceTimersToNextTimer();

    await vi.waitFor(() => {
      expect(connectionFrames[1] ?? []).toEqual([
        {
          action: 'subscribe',
          subscriptions: [{ topic: 'crypto_prices', type: 'update' }],
        },
      ]);
    });

    secondClient?.send(
      JSON.stringify({
        payload: { symbol: 'btcusdt', timestamp: 1, value: 100 },
        timestamp: 1,
        topic: 'crypto_prices',
        type: 'update',
      }),
    );

    await expect(next).resolves.toMatchObject({
      done: false,
      value: {
        payload: { symbol: 'btcusdt', value: '100' },
        topic: 'prices.crypto.binance',
        type: 'update',
      },
    });
  });

  it('reconnects and resubscribes both TWAP windows', {
    timeout: 5_000,
  }, async () => {
    const connectionFrames: unknown[][] = [];
    let firstClient: { close: () => void } | undefined;
    let secondClient: { send: (data: string) => void } | undefined;

    server.use(
      rtds.addEventListener('connection', ({ client }) => {
        const frames: unknown[] = [];
        connectionFrames.push(frames);
        if (connectionFrames.length === 1) firstClient = client;
        if (connectionFrames.length === 2) secondClient = client;
        client.addEventListener('message', (event) => {
          frames.push(JSON.parse(String(event.data)));
        });
      }),
    );

    vi.useFakeTimers();

    const thirtySecondHandle = await manager.subscribe({
      topic: 'prices.crypto.chainlink.twap',
      windowSeconds: 30,
      symbols: ['btc/usd'],
    });
    await manager.subscribe({
      topic: 'prices.crypto.chainlink.twap',
      windowSeconds: 30,
      symbols: ['eth/usd'],
    });
    const sixtySecondHandle = await manager.subscribe({
      topic: 'prices.crypto.chainlink.twap',
      windowSeconds: 60,
      symbols: ['btc/usd'],
    });

    await vi.waitFor(() => {
      expect(connectionFrames[0] ?? []).toEqual([
        {
          action: 'subscribe',
          subscriptions: [
            { topic: 'crypto_prices_twap_thirty', type: 'update' },
          ],
        },
        {
          action: 'subscribe',
          subscriptions: [
            { topic: 'crypto_prices_twap_sixty', type: 'update' },
          ],
        },
      ]);
    });

    firstClient?.close();
    await vi.advanceTimersToNextTimer();

    await vi.waitFor(() => {
      expect(connectionFrames[1] ?? []).toEqual([
        {
          action: 'subscribe',
          subscriptions: [
            { topic: 'crypto_prices_twap_thirty', type: 'update' },
            { topic: 'crypto_prices_twap_sixty', type: 'update' },
          ],
        },
      ]);
    });

    const thirtySecondNext = waitForNextEvent(thirtySecondHandle);
    const sixtySecondNext = waitForNextEvent(sixtySecondHandle);
    secondClient?.send(
      JSON.stringify(
        twapFrame({
          topic: 'crypto_prices_twap_thirty',
          windowSeconds: 30,
        }),
      ),
    );
    secondClient?.send(
      JSON.stringify(
        twapFrame({
          topic: 'crypto_prices_twap_sixty',
          windowSeconds: 60,
        }),
      ),
    );

    await expect(thirtySecondNext).resolves.toMatchObject({
      value: { payload: { symbol: 'btc/usd', windowSeconds: 30 } },
    });
    await expect(sixtySecondNext).resolves.toMatchObject({
      value: { payload: { symbol: 'btc/usd', windowSeconds: 60 } },
    });
  });
});
