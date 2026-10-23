import type { BearerCredentials } from '@polymarket/bindings';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestRejectedError } from '../errors';
import { AuthSession } from '../session';
import { SocketAuthentication } from './authentication';

function pair(sequence = 0, seconds = 900): BearerCredentials {
  return {
    accessToken: `test.${btoa(JSON.stringify({ sub: '0x0000000000000000000000000000000000000001', client_id: 'synthetic-client', exp: Math.floor(Date.now() / 1000) + seconds, jti: sequence }))}.test`,
    refreshToken: `synthetic-refresh-${sequence}`,
  };
}
afterEach(() => vi.useRealTimers());

describe('acknowledged socket lifecycle', () => {
  it('does not extend the accepted deadline before acknowledgement or after rejection', async () => {
    vi.useFakeTimers();
    const original = pair(0, 60);
    const replacement = pair(1);
    const session = new AuthSession({
      credentials: original,
      refresh: async () => replacement,
    });
    const pending = Promise.withResolvers<void>();
    const authenticate = vi.fn(() => pending.promise);
    const fail = vi.fn();
    const socket = new SocketAuthentication({ session, authenticate, fail });
    socket.accepted(original.accessToken);
    await session.refresh();
    expect(authenticate).toHaveBeenCalledExactlyOnceWith(
      replacement.accessToken,
    );
    pending.reject(
      new RequestRejectedError('invalid renewal', { status: 401 }),
    );
    await vi.advanceTimersByTimeAsync(90_000);
    expect(fail).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: 'expired_access_token' }),
    );
    socket.stop();
    session.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('adopts acknowledged renewal without changing subscriptions and renews again when a newer pair arrives during ack', async () => {
    vi.useFakeTimers();
    const original = pair(0, 60);
    let sequence = 0;
    const session = new AuthSession({
      credentials: original,
      refresh: async () => pair(++sequence),
    });
    const first = Promise.withResolvers<void>();
    const authenticate = vi.fn(async () => {
      if (authenticate.mock.calls.length === 1) await first.promise;
    });
    const fail = vi.fn();
    const socket = new SocketAuthentication({ session, authenticate, fail });
    socket.accepted(original.accessToken);
    await session.refresh();
    await session.refresh();
    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(authenticate).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(fail).not.toHaveBeenCalled();
    socket.stop();
    session.close();
  });

  it.each([
    false,
    true,
  ])('bounds unavailable retries and cancels backoff (stop early: %s)', async (stopEarly) => {
    vi.useFakeTimers();
    const original = pair(0, 60);
    const session = new AuthSession({
      credentials: original,
      refresh: async () => pair(1),
    });
    const authenticate = vi.fn(async () => {
      throw new RequestRejectedError('unavailable', {
        status: 503,
        code: 'auth_unavailable',
      });
    });
    const socket = new SocketAuthentication({
      session,
      authenticate,
      fail: vi.fn(),
    });
    socket.accepted(original.accessToken);
    await session.refresh();
    if (!stopEarly) await vi.advanceTimersByTimeAsync(750);
    const attempts = stopEarly ? 1 : 3;
    expect(authenticate).toHaveBeenCalledTimes(attempts);
    socket.stop();
    session.close();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(authenticate).toHaveBeenCalledTimes(attempts);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reconnect preparation joins the same proactive refresh as HTTP', async () => {
    const original = pair(0, 1);
    const deferred = Promise.withResolvers<BearerCredentials>();
    const refresh = vi.fn(() => deferred.promise);
    const session = new AuthSession({ credentials: original, refresh });
    const socket = new SocketAuthentication({
      session,
      authenticate: async () => undefined,
      fail: vi.fn(),
    });
    const connecting = socket.prepare();
    const http = session.ready();
    const updated = pair(1);
    deferred.resolve(updated);
    await expect(connecting).resolves.toEqual(updated);
    await expect(http).resolves.toEqual(updated);
    expect(refresh).toHaveBeenCalledTimes(1);
    socket.stop();
    session.close();
  });
});
