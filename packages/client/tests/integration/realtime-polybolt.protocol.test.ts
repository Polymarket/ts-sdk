import { describe, expect } from 'vitest';
import { environment, it, runMeteredTests } from './fixtures';

type Frame = {
  op?: string;
  rid?: string;
  code?: string;
  channel?: string;
  snapshot?: boolean;
};

describe.runIf(runMeteredTests)('realtime protocol', () => {
  it('pins authentication, heartbeat exclusion, invalid filters, barriers and the connection limit', async ({
    secureClientWithDepositWallet,
  }) => {
    const socket = new WebSocket(environment.realtime.ws);
    const timeout = setTimeout(() => socket.close(), 50_000);
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
        socket.addEventListener(
          'close',
          () => reject(new Error('Realtime websocket closed before opening.')),
          { once: true },
        );
      });
      const { key, secret, passphrase } =
        secureClientWithDepositWallet.credentials;
      socket.send(
        JSON.stringify({
          op: 'auth',
          auth: { apiKey: key, secret, passphrase },
          rid: 'auth',
        }),
      );
      await expect
        .poll(
          () =>
            frames.some(
              (frame) => frame.op === 'authed' && frame.rid === 'auth',
            ),
          { timeout: 10_000 },
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
        .poll(() => frames.filter((frame) => frame.op === 'pong').length, {
          timeout: 10_000,
        })
        .toBe(25);
      expect(frames.some((frame) => frame.code === 'bad_op')).toBe(true);
      await expect
        .poll(() => frames.some((frame) => frame.code === 'bad_filter'), {
          timeout: 10_000,
        })
        .toBe(true);
      expect(socket.readyState).toBe(WebSocket.OPEN);
      socket.send(
        JSON.stringify({
          op: 'subscribe',
          subscriptions: Array.from({ length: 64 }, (_, index) => ({
            channel: 'price.crypto',
            filter: { symbol: `asset${index}usd` },
          })),
          rid: 'capacity',
        }),
      );
      await expect
        .poll(() => frames.filter((frame) => frame.snapshot).length, {
          timeout: 10_000,
        })
        .toBe(64);
      socket.send(
        JSON.stringify({
          op: 'subscribe',
          subscriptions: [
            { channel: 'price.crypto', filter: { symbol: 'asset64usd' } },
          ],
          rid: 'limit',
        }),
      );
      expect(await closed).toBe(4008);
      expect(frames.some((frame) => frame.code === 'sub_limit')).toBe(true);
      expect(frames.filter((frame) => frame.snapshot).length).toBe(64);
    } finally {
      clearTimeout(timeout);
      socket.close();
      await secureClientWithDepositWallet.closeSubscriptions();
    }
  });
});
