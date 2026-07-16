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
  expectSurfacesUnknownFrame,
  waitForNextEvent,
} from './testing';

const rtds = ws.link(production.rtds.ws);
const server = setupServer();
const manager = new RtdsWebSocketManager({ url: production.rtds.ws });

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

  it('surfaces unknown frames without closing the shared socket', async () => {
    await expectSurfacesUnknownFrame({
      expectedEvent: { topic: 'prices.crypto.binance', type: 'update' },
      link: rtds,
      server,
      stream: 'rtds',
      subscribe: async (onUnknownFrame) => {
        const observedManager = new RtdsWebSocketManager({
          onUnknownFrame,
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
});
