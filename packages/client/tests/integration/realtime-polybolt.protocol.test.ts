import { describe, expect } from 'vitest';
import { environment } from './fixtures';
import { it } from './realtime-fixtures';

type Frame = {
  op?: string;
  rid?: string;
  code?: string;
  channel?: string;
  snapshot?: boolean;
};

describe('realtime protocol', () => {
  it('pins authentication, heartbeat exclusion, invalid filters, barriers and the connection limit', async ({
    realtimeClient,
  }) => {
    const socket = new WebSocket(environment.realtime.ws);
    const frames: Frame[] = [];
    const closed = new Promise<number>((resolve) =>
      socket.addEventListener('close', (event) => resolve(event.code)),
    );
    socket.addEventListener('message', (event) =>
      frames.push(JSON.parse(String(event.data)) as Frame),
    );
    try {
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener(
          'error',
          () => reject(new Error('Realtime websocket upgrade failed.')),
          { once: true },
        );
      });
      const { key, secret, passphrase } = realtimeClient.credentials;
      socket.send(
        JSON.stringify({
          op: 'auth',
          auth: { apiKey: key, secret, passphrase },
          rid: 'auth',
        }),
      );
      await expect
        .poll(() =>
          frames.some((frame) => frame.op === 'authed' && frame.rid === 'auth'),
        )
        .toBe(true);
      socket.send('PING');
      for (let index = 0; index < 25; index++)
        socket.send(JSON.stringify({ op: 'ping', rid: `ping-${index}` }));
      socket.send(
        JSON.stringify({
          op: 'subscribe',
          channel: 'price.crypto',
          filter: {},
          rid: 'bad-filter',
        }),
      );
      await expect
        .poll(() => frames.filter((frame) => frame.op === 'pong').length)
        .toBe(25);
      expect(frames.some((frame) => frame.code === 'bad_op')).toBe(true);
      expect(frames.some((frame) => frame.code === 'bad_filter')).toBe(true);
      expect(socket.readyState).toBe(WebSocket.OPEN);
      socket.send(
        JSON.stringify({
          op: 'subscribe',
          subscriptions: Array.from({ length: 65 }, (_, index) => ({
            channel: 'price.polymarket',
            filter: { asset_id: String(index + 1) },
          })),
          rid: 'limit',
        }),
      );
      expect(await closed).toBe(4008);
      expect(frames.some((frame) => frame.code === 'sub_limit')).toBe(true);
      expect(frames.filter((frame) => frame.snapshot).length).toBe(64);
    } finally {
      socket.close();
      await realtimeClient.closeSubscriptions();
    }
  });
});
