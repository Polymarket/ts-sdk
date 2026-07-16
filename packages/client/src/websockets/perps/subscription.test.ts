import { PerpsKlineInterval } from '@polymarket/bindings/perps';
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
import { production } from '../../environments';
import {
  captureConnection,
  collectFrames,
  expectSurfacesUnknownFrame,
  waitForNextEvent,
} from '../testing';
import { PerpsSubscriptionManager } from './subscription';

const perpsSubscriptions = ws.link(production.perps.ws);
const server = setupServer();
const manager = new PerpsSubscriptionManager({ url: production.perps.ws });

describe('PerpsSubscriptionManager', () => {
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

  it('adds and removes upstream channels on the shared socket', async () => {
    const frames = collectFrames(server, perpsSubscriptions);

    const tradesHandle = await manager.subscribe({
      instrumentId: 1,
      topic: 'perps.trades',
    });
    await manager.subscribe({
      interval: PerpsKlineInterval.OneMinute,
      instrumentId: 1,
      topic: 'perps.candles',
    });

    await vi.waitFor(() => {
      expect(frames).toEqual([
        { id: expect.any(Number), req: 'sub', chs: ['trades::1'] },
        { id: expect.any(Number), req: 'sub', chs: ['klines::1::1m'] },
      ]);
    });

    frames.length = 0;
    await tradesHandle.close();
    expect(frames).toEqual([
      { id: expect.any(Number), req: 'unsub', chs: ['trades::1'] },
    ]);
  });

  it('replaces broad ticker channels with specific channels when needed', async () => {
    const frames = collectFrames(server, perpsSubscriptions);

    await manager.subscribe({ instrumentId: 1, topic: 'perps.tickers' });
    const allTickersHandle = await manager.subscribe({
      topic: 'perps.tickers',
    });

    await vi.waitFor(() => {
      expect(frames).toEqual([
        { id: expect.any(Number), req: 'sub', chs: ['tickers::1'] },
        { id: expect.any(Number), req: 'sub', chs: ['tickers::all'] },
        { id: expect.any(Number), req: 'unsub', chs: ['tickers::1'] },
      ]);
    });

    frames.length = 0;
    await allTickersHandle.close();
    expect(frames).toEqual([
      { id: expect.any(Number), req: 'sub', chs: ['tickers::1'] },
      { id: expect.any(Number), req: 'unsub', chs: ['tickers::all'] },
    ]);
  });

  it('normalizes and fans out matching book updates', async () => {
    const connection = captureConnection(server, perpsSubscriptions);

    const handle = await manager.subscribe({
      instrumentId: 1,
      topic: 'perps.book',
    });
    const next = waitForNextEvent(handle);

    await connection.send({
      ch: 'book::1',
      data: {
        a: [['101', '2']],
        b: [['100', '1']],
      },
      sq: 10,
      ts: 1_700_000_000_000,
    });

    await expect(next).resolves.toMatchObject({
      done: false,
      value: {
        payload: {
          asks: [{ price: '101', quantity: '2' }],
          bids: [{ price: '100', quantity: '1' }],
          instrumentId: 1,
        },
        sequence: 10,
        timestamp: 1_700_000_000_000,
        topic: 'perps.book',
        type: 'book',
      },
    });
  });

  it('surfaces unknown frames without closing the shared socket', async () => {
    await expectSurfacesUnknownFrame({
      // Request acknowledgements echo the request id and are expected
      // control frames, not unknown events.
      expectedControlFrames: [{ id: 7, ret: 'ok' }],
      expectedEvent: { topic: 'perps.book', type: 'book' },
      link: perpsSubscriptions,
      server,
      stream: 'perpsSubscriptions',
      subscribe: async (onUnknownFrame) => {
        const observedManager = new PerpsSubscriptionManager({
          onUnknownFrame,
          url: production.perps.ws,
        });
        const events = await observedManager.subscribe({
          instrumentId: 1,
          topic: 'perps.book',
        });
        return { close: () => observedManager.close(), events };
      },
      unknownFrame: {
        ch: 'future_channel::1',
        data: { hello: 'world' },
        sq: 1,
        ts: 1_700_000_000_000,
      },
      validFrame: {
        ch: 'book::1',
        data: {
          a: [['101', '2']],
          b: [['100', '1']],
        },
        sq: 10,
        ts: 1_700_000_000_000,
      },
    });
  });

  it('reconnects and resubscribes active channels after an unexpected close', {
    timeout: 5_000,
  }, async () => {
    const connectionFrames: unknown[][] = [];
    let firstClient: { close: () => void } | undefined;

    server.use(
      perpsSubscriptions.addEventListener('connection', ({ client }) => {
        const frames: unknown[] = [];
        connectionFrames.push(frames);
        if (connectionFrames.length === 1) firstClient = client;
        client.addEventListener('message', (event) => {
          frames.push(JSON.parse(String(event.data)));
        });
      }),
    );

    vi.useFakeTimers();

    await manager.subscribe({ instrumentId: 1, topic: 'perps.bbo' });

    await vi.waitFor(() => {
      expect(connectionFrames[0] ?? []).toEqual([
        { id: expect.any(Number), req: 'sub', chs: ['bbo::1'] },
      ]);
    });

    firstClient?.close();
    await vi.advanceTimersToNextTimer();

    await vi.waitFor(() => {
      expect(connectionFrames[1] ?? []).toEqual([
        { id: expect.any(Number), req: 'sub', chs: ['bbo::1'] },
      ]);
    });
  });
});
