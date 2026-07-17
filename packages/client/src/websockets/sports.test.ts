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
import { SportsWebSocketManager } from './sports';
import {
  captureConnection,
  expectDropsUnknownFrame,
  waitForNextEvent,
} from './testing';

const sports = ws.link(production.sports.ws);
const server = setupServer();
const manager = new SportsWebSocketManager({
  url: production.sports.ws,
});

describe('SportsWebSocketManager', () => {
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

  it('responds to ping heartbeats', async () => {
    const frames: string[] = [];

    server.use(
      sports.addEventListener('connection', ({ client }) => {
        client.addEventListener('message', (event) => {
          frames.push(String(event.data));
        });
        client.send('ping');
      }),
    );

    await manager.subscribe({ topic: 'sports' });

    await vi.waitFor(() => {
      expect(frames).toContain('pong');
    });
  });

  it('fans out events to active subscriptions', async () => {
    const connection = captureConnection(server, sports);

    const firstHandle = await manager.subscribe({ topic: 'sports' });
    const secondHandle = await manager.subscribe({ topic: 'sports' });
    const firstNext = waitForNextEvent(firstHandle);
    const secondNext = waitForNextEvent(secondHandle);

    await connection.send({
      ended: false,
      gameId: 123,
      leagueAbbreviation: 'NBA',
      live: true,
      score: '0-0',
      status: 'inprogress',
    });

    await expect(firstNext).resolves.toMatchObject({
      done: false,
      value: {
        payload: { gameId: 123, leagueAbbreviation: 'NBA' },
        topic: 'sports',
        type: 'sport_result',
      },
    });
    await expect(secondNext).resolves.toMatchObject({
      done: false,
      value: {
        payload: { gameId: 123, leagueAbbreviation: 'NBA' },
        topic: 'sports',
        type: 'sport_result',
      },
    });
  });

  it('drops unknown frames without closing the shared socket', async () => {
    await expectDropsUnknownFrame({
      expectedEvent: { topic: 'sports', type: 'sport_result' },
      link: sports,
      server,
      subscribe: async () => {
        const observedManager = new SportsWebSocketManager({
          url: production.sports.ws,
        });
        const events = await observedManager.subscribe({ topic: 'sports' });
        return { close: () => observedManager.close(), events };
      },
      unknownFrame: { event: 'future_event', payload: 'new' },
      validFrame: {
        ended: false,
        gameId: 123,
        leagueAbbreviation: 'NBA',
        live: true,
        score: '0-0',
        status: 'inprogress',
      },
    });
  });

  it('reconnects active subscriptions after an unexpected close', {
    timeout: 5_000,
  }, async () => {
    const connections: { close: () => void }[] = [];

    server.use(
      sports.addEventListener('connection', ({ client }) => {
        connections.push(client);
      }),
    );

    vi.useFakeTimers();

    await manager.subscribe({ topic: 'sports' });

    await vi.waitFor(() => {
      expect(connections).toHaveLength(1);
    });

    connections[0]?.close();
    await vi.advanceTimersToNextTimer();

    await vi.waitFor(() => {
      expect(connections).toHaveLength(2);
    });
  });
});
