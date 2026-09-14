import { afterEach, describe, expect, it, vi } from 'vitest';
import { PolyboltWebSocketHeartbeat } from '../heartbeat';
import { polyboltReconnectDelay, subscriptionsFor } from './protocol';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('price subscription normalization and heartbeat', () => {
  it('normalizes crypto aliases to the same shared subscription key', () => {
    const aliases = subscriptionsFor({
      topic: 'prices.crypto',
      symbols: ['BTC/USDT', 'btcusd'],
    });
    expect(aliases[0]).toEqual(aliases[1]);
    expect(aliases[0]).toMatchObject({ symbol: 'btcusd' });
  });
  it('uses draining jitter independently of the exponential retry count', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(polyboltReconnectDelay(4003, 0)).toBe(9990);
    expect(polyboltReconnectDelay(4003, 20)).toBe(9990);
    expect(polyboltReconnectDelay(4002, 0)).toBe(999);
    expect(polyboltReconnectDelay(1006, 20)).toBe(29970);
  });
  it('sends protocol pings and treats any inbound message as liveness', async () => {
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
