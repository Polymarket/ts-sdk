import { toTokenId } from '@polymarket/bindings';
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
import { ClobMarketWebSocketManager } from './market';

const CONDITION_ID = `0x${'ab'.repeat(32)}`;
const TOKEN_A = toTokenId('token-a');
const TOKEN_B = toTokenId('token-b');
const clobMarket = ws.link(production.clob.market.ws);
const server = setupServer();
const manager = new ClobMarketWebSocketManager({
  url: production.clob.market.ws,
});

describe('ClobMarketWebSocketManager', () => {
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

  it('adds and removes assets on the shared socket', async () => {
    const frames = collectFrames(server, clobMarket);

    const firstHandle = await manager.subscribe({
      assetIds: [TOKEN_A],
      topic: 'market',
    });
    await manager.subscribe({ assetIds: [TOKEN_B], topic: 'market' });

    await vi.waitFor(() => {
      expect(frames).toEqual([
        {
          assets_ids: [TOKEN_A],
          custom_feature_enabled: false,
          type: 'market',
        },
        {
          assets_ids: [TOKEN_B],
          custom_feature_enabled: false,
          operation: 'subscribe',
        },
      ]);
    });

    frames.length = 0;
    await firstHandle.close();
    expect(frames).toEqual([
      { assets_ids: [TOKEN_A], operation: 'unsubscribe' },
    ]);
  });

  it('accepts tokenIds as a compatibility subscription input', async () => {
    const frames = collectFrames(server, clobMarket);

    await manager.subscribe({ tokenIds: [TOKEN_A], topic: 'market' });

    await vi.waitFor(() => {
      expect(frames).toEqual([
        {
          assets_ids: [TOKEN_A],
          custom_feature_enabled: false,
          type: 'market',
        },
      ]);
    });
  });

  it('updates the custom feature flag on the shared socket', async () => {
    const frames = collectFrames(server, clobMarket);

    await manager.subscribe({ assetIds: [TOKEN_A], topic: 'market' });
    const customHandle = await manager.subscribe({
      customFeatureEnabled: true,
      assetIds: [TOKEN_A],
      topic: 'market',
    });

    await vi.waitFor(() => {
      expect(frames).toEqual([
        {
          assets_ids: [TOKEN_A],
          custom_feature_enabled: false,
          type: 'market',
        },
        {
          assets_ids: [TOKEN_A],
          custom_feature_enabled: true,
          operation: 'subscribe',
        },
      ]);
    });

    frames.length = 0;
    await customHandle.close();
    expect(frames).toEqual([
      {
        assets_ids: [TOKEN_A],
        custom_feature_enabled: false,
        operation: 'subscribe',
      },
    ]);
  });

  it('fans out events to matching subscriptions', async () => {
    const connection = captureConnection(server, clobMarket);

    const handle = await manager.subscribe({
      assetIds: [TOKEN_A],
      topic: 'market',
    });
    const next = waitForNextEvent(handle);

    await connection.send({
      asks: [],
      asset_id: TOKEN_A,
      bids: [],
      event_type: 'book',
      market: CONDITION_ID,
    });

    await expect(next).resolves.toMatchObject({
      done: false,
      value: {
        payload: {
          assetId: TOKEN_A,
          conditionId: CONDITION_ID,
          tokenId: TOKEN_A,
        },
        topic: 'market',
        type: 'book',
      },
    });
  });

  it('drops unknown frames without closing the shared socket', async () => {
    await expectDropsUnknownFrame({
      expectedEvent: { topic: 'market', type: 'book' },
      link: clobMarket,
      server,
      subscribe: async () => {
        const observedManager = new ClobMarketWebSocketManager({
          url: production.clob.market.ws,
        });
        const events = await observedManager.subscribe({
          assetIds: [TOKEN_A],
          topic: 'market',
        });
        return { close: () => observedManager.close(), events };
      },
      unknownFrame: { event_type: 'future_event', payload: 'new' },
      validFrame: {
        asks: [],
        asset_id: TOKEN_A,
        bids: [],
        event_type: 'book',
        market: CONDITION_ID,
      },
    });
  });

  it('delivers custom events only to custom-enabled subscriptions', async () => {
    const connection = captureConnection(server, clobMarket);

    const standardHandle = await manager.subscribe({
      assetIds: [TOKEN_A],
      topic: 'market',
    });
    const customHandle = await manager.subscribe({
      customFeatureEnabled: true,
      assetIds: [TOKEN_A],
      topic: 'market',
    });
    const standardNext = waitForNextEvent(standardHandle);
    const customNext = waitForNextEvent(customHandle);

    await connection.send({
      asset_id: TOKEN_A,
      best_ask: '0.51',
      best_bid: '0.49',
      event_type: 'best_bid_ask',
      market: CONDITION_ID,
    });

    await expect(customNext).resolves.toMatchObject({
      done: false,
      value: {
        payload: {
          assetId: TOKEN_A,
          conditionId: CONDITION_ID,
          tokenId: TOKEN_A,
        },
        topic: 'market',
        type: 'best_bid_ask',
      },
    });

    await standardHandle.close();
    await expect(standardNext).resolves.toMatchObject({ done: true });
  });

  it('sends PING heartbeats while subscribed', { timeout: 5_000 }, async () => {
    const frames: string[] = [];

    server.use(
      clobMarket.addEventListener('connection', ({ client }) => {
        client.addEventListener('message', (event) => {
          frames.push(String(event.data));
          if (event.data === 'PING') client.send('PONG');
        });
      }),
    );

    vi.useFakeTimers();

    await manager.subscribe({ assetIds: [TOKEN_A], topic: 'market' });

    await vi.advanceTimersByTimeAsync(10_000);

    expect(frames).toContain('PING');
  });

  it('reconnects and resubscribes active assets after an unexpected close', {
    timeout: 5_000,
  }, async () => {
    const connectionFrames: unknown[][] = [];
    let firstClient: { close: () => void } | undefined;

    server.use(
      clobMarket.addEventListener('connection', ({ client }) => {
        const frames: unknown[] = [];
        connectionFrames.push(frames);
        if (connectionFrames.length === 1) firstClient = client;
        client.addEventListener('message', (event) => {
          frames.push(JSON.parse(String(event.data)));
        });
      }),
    );

    vi.useFakeTimers();

    await manager.subscribe({ assetIds: [TOKEN_A], topic: 'market' });

    await vi.waitFor(() => {
      expect(connectionFrames[0] ?? []).toEqual([
        {
          assets_ids: [TOKEN_A],
          custom_feature_enabled: false,
          type: 'market',
        },
      ]);
    });

    firstClient?.close();
    await vi.advanceTimersToNextTimer();

    await vi.waitFor(() => {
      expect(connectionFrames[1] ?? []).toEqual([
        {
          assets_ids: [TOKEN_A],
          custom_feature_enabled: false,
          type: 'market',
        },
      ]);
    });
  });
});
