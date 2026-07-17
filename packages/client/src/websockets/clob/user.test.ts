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
import { production } from '../../environments';
import {
  captureConnection,
  collectFrames,
  expectDropsUnknownFrame,
  waitForNextEvent,
} from '../testing';
import { ClobUserWebSocketManager } from './user';

const clobUser = ws.link(production.clob.user.ws);
const server = setupServer();
const credentials = ApiKeyCredsSchema.parse({
  apiKey: 'test-key',
  passphrase: 'test-passphrase',
  secret: 'test-secret',
});
const manager = new ClobUserWebSocketManager({
  credentials,
  url: production.clob.user.ws,
});

describe('ClobUserWebSocketManager', () => {
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

  it('sends credentials and market filters in the initial subscribe frame', async () => {
    const frames = collectFrames(server, clobUser);

    await manager.subscribe({ markets: ['market-a'], topic: 'user' });

    await vi.waitFor(() => {
      expect(frames).toEqual([
        {
          auth: {
            apiKey: 'test-key',
            passphrase: 'test-passphrase',
            secret: 'test-secret',
          },
          markets: ['market-a'],
          type: 'user',
        },
      ]);
    });
  });

  it('omits market filters from the initial subscribe frame for all markets', async () => {
    const frames = collectFrames(server, clobUser);

    await manager.subscribe({ topic: 'user' });

    await vi.waitFor(() => {
      expect(frames).toEqual([
        {
          auth: {
            apiKey: 'test-key',
            passphrase: 'test-passphrase',
            secret: 'test-secret',
          },
          type: 'user',
        },
      ]);
    });
  });

  it('keeps the shared socket broad while any subscription includes all markets', async () => {
    const frames = collectFrames(server, clobUser);

    await manager.subscribe({ markets: ['market-a'], topic: 'user' });
    const broadHandle = await manager.subscribe({ topic: 'user' });

    await vi.waitFor(() => {
      expect(frames).toEqual([
        {
          auth: {
            apiKey: 'test-key',
            passphrase: 'test-passphrase',
            secret: 'test-secret',
          },
          markets: ['market-a'],
          type: 'user',
        },
        { markets: ['market-a'], operation: 'unsubscribe' },
      ]);
    });

    frames.length = 0;
    await broadHandle.close();
    expect(frames).toEqual([{ markets: ['market-a'], operation: 'subscribe' }]);
  });

  it('fans out events to matching market subscriptions', async () => {
    const connection = captureConnection(server, clobUser);

    const marketAHandle = await manager.subscribe({
      markets: ['market-a'],
      topic: 'user',
    });
    const marketBHandle = await manager.subscribe({
      markets: ['market-b'],
      topic: 'user',
    });
    const marketANext = waitForNextEvent(marketAHandle);
    const marketBNext = waitForNextEvent(marketBHandle);

    await connection.send({
      asset_id: 'token-a',
      event_type: 'order',
      id: 'order-a',
      market: 'market-a',
      original_size: '1',
      owner: 'test-owner',
      price: '0.5',
      side: 'BUY',
      size_matched: '0',
      timestamp: '1',
      type: 'PLACEMENT',
    });

    await expect(marketANext).resolves.toMatchObject({
      done: false,
      value: {
        payload: { market: 'market-a', orderEventType: 'PLACEMENT' },
        topic: 'user',
        type: 'order',
      },
    });

    await marketBHandle.close();
    await expect(marketBNext).resolves.toMatchObject({ done: true });
  });

  it('delivers trade events when the websocket uses short trade statuses', async () => {
    const connection = captureConnection(server, clobUser);
    const handle = await manager.subscribe({ topic: 'user' });
    const next = waitForNextEvent(handle);

    await connection.send({
      asset_id: 'token-a',
      event_type: 'trade',
      fee_rate_bps: '0',
      id: 'trade-a',
      last_update: '1710000000',
      maker_address: '0x0000000000000000000000000000000000000001',
      market: 'market-a',
      match_time: '1710000000',
      owner: 'test-owner',
      price: '0.5',
      side: 'BUY',
      size: '1',
      status: 'CONFIRMED',
      taker_order_id: 'order-a',
      timestamp: '1710000000000',
      trade_owner: 'test-owner',
      type: 'TRADE',
    });

    await expect(next).resolves.toMatchObject({
      done: false,
      value: {
        payload: {
          id: 'trade-a',
          status: 'TRADE_STATUS_CONFIRMED',
          takerOrderId: 'order-a',
        },
        topic: 'user',
        type: 'trade',
      },
    });
  });

  it('drops trade events with unrecognized statuses without closing the shared socket', async () => {
    function tradeFrame(status: string) {
      return {
        asset_id: 'token-a',
        event_type: 'trade',
        fee_rate_bps: '0',
        id: 'trade-a',
        last_update: '1710000000',
        maker_address: '0x0000000000000000000000000000000000000001',
        market: 'market-a',
        match_time: '1710000000',
        owner: 'test-owner',
        price: '0.5',
        side: 'BUY',
        size: '1',
        status,
        taker_order_id: 'order-a',
        timestamp: '1710000000000',
        trade_owner: 'test-owner',
        type: 'TRADE',
      };
    }

    await expectDropsUnknownFrame({
      expectedEvent: {
        payload: { id: 'trade-a', status: 'TRADE_STATUS_CONFIRMED' },
        topic: 'user',
        type: 'trade',
      },
      link: clobUser,
      server,
      subscribe: async () => {
        const observedManager = new ClobUserWebSocketManager({
          credentials,
          url: production.clob.user.ws,
        });
        const events = await observedManager.subscribe({ topic: 'user' });
        return { close: () => observedManager.close(), events };
      },
      unknownFrame: tradeFrame('TRADE_STATUS_FUTURE_STATUS'),
      validFrame: tradeFrame('TRADE_STATUS_CONFIRMED'),
    });
  });

  it('drops unknown frames without closing the shared socket', async () => {
    await expectDropsUnknownFrame({
      expectedEvent: { topic: 'user', type: 'order' },
      link: clobUser,
      server,
      subscribe: async () => {
        const observedManager = new ClobUserWebSocketManager({
          credentials,
          url: production.clob.user.ws,
        });
        const events = await observedManager.subscribe({
          markets: ['market-a'],
          topic: 'user',
        });
        return { close: () => observedManager.close(), events };
      },
      unknownFrame: { event_type: 'future_event', payload: 'new' },
      validFrame: {
        asset_id: 'token-a',
        event_type: 'order',
        id: 'order-a',
        market: 'market-a',
        original_size: '1',
        owner: 'test-owner',
        price: '0.5',
        side: 'BUY',
        size_matched: '0',
        timestamp: '1',
        type: 'PLACEMENT',
      },
    });
  });

  it('sends PING heartbeats while subscribed', { timeout: 5_000 }, async () => {
    const frames: string[] = [];

    server.use(
      clobUser.addEventListener('connection', ({ client }) => {
        client.addEventListener('message', (event) => {
          frames.push(String(event.data));
          if (event.data === 'PING') client.send('PONG');
        });
      }),
    );

    vi.useFakeTimers();

    await manager.subscribe({ topic: 'user' });

    await vi.advanceTimersByTimeAsync(10_000);

    expect(frames).toContain('PING');
  });

  it('reconnects and resubscribes active markets after an unexpected close', {
    timeout: 5_000,
  }, async () => {
    const connectionFrames: unknown[][] = [];
    let firstClient: { close: () => void } | undefined;

    server.use(
      clobUser.addEventListener('connection', ({ client }) => {
        const frames: unknown[] = [];
        connectionFrames.push(frames);
        if (connectionFrames.length === 1) firstClient = client;
        client.addEventListener('message', (event) => {
          frames.push(JSON.parse(String(event.data)));
        });
      }),
    );

    vi.useFakeTimers();

    await manager.subscribe({ markets: ['market-a'], topic: 'user' });

    await vi.waitFor(() => {
      expect(connectionFrames[0] ?? []).toEqual([
        {
          auth: {
            apiKey: 'test-key',
            passphrase: 'test-passphrase',
            secret: 'test-secret',
          },
          markets: ['market-a'],
          type: 'user',
        },
      ]);
    });

    firstClient?.close();
    await vi.advanceTimersToNextTimer();

    await vi.waitFor(() => {
      expect(connectionFrames[1] ?? []).toEqual([
        {
          auth: {
            apiKey: 'test-key',
            passphrase: 'test-passphrase',
            secret: 'test-secret',
          },
          markets: ['market-a'],
          type: 'user',
        },
      ]);
    });
  });
});
