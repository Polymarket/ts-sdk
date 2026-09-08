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
import { TransportError } from '../../errors';
import { PolyboltWebSocketHeartbeat } from '../heartbeat';
import { RealtimeWebSocketManager } from './manager';
import { polyboltReconnectDelay } from './protocol';

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

  it('times out a missing subscribe acknowledgement and releases its connection', async () => {
    vi.useFakeTimers();
    const manager = new RealtimeWebSocketManager({
      url,
      protocol: 'polybolt',
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
      await vi.advanceTimersByTimeAsync(10_001);
      await rejected;
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
