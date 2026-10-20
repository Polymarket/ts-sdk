import type { BearerCredentials } from '@polymarket/bindings';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestRejectedError, TransportError } from './errors';
import { AuthSession } from './session';

const sub = '0x0000000000000000000000000000000000000001';
function tokens(sequence = 0, seconds = 900): BearerCredentials {
  return {
    accessToken: `test.${btoa(JSON.stringify({ sub, client_id: 'synthetic-client', exp: Math.floor(Date.now() / 1000) + seconds, jti: sequence }))}.test`,
    refreshToken: `synthetic-refresh-${sequence}`,
  };
}
afterEach(() => vi.useRealTimers());

describe('shared session policy', () => {
  it('single-flights timer, HTTP and socket callers, adopts both tokens, and notifies after adoption', async () => {
    vi.useFakeTimers();
    const original = tokens();
    const deferred = Promise.withResolvers<BearerCredentials>();
    const refresh = vi.fn(() => deferred.promise);
    const changed = vi.fn(async (pair: BearerCredentials) => {
      expect(session.credentials).toEqual(pair);
    });
    const session = new AuthSession({
      credentials: original,
      refresh,
      onCredentialsChanged: changed,
    });
    session.start();
    await vi.advanceTimersByTimeAsync(870_000);
    const http = session.recover(original.accessToken);
    const socket = session.ready();
    const updated = tokens(1);
    deferred.resolve(updated);
    await Promise.all([http, socket]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(session.credentials).toEqual(updated);
    expect(changed).toHaveBeenCalledExactlyOnceWith(updated);
    await session.recover(original.accessToken);
    expect(refresh).toHaveBeenCalledTimes(1);
    session.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    'sync',
    'async',
  ])('ignores %s persistence failure without discarding adopted tokens or scheduling', async (kind) => {
    vi.useFakeTimers();
    const updated = tokens(1);
    const session = new AuthSession({
      credentials: tokens(),
      refresh: async () => updated,
      onCredentialsChanged: () => {
        if (kind === 'sync') throw new Error('storage unavailable');
        return Promise.reject(new Error('storage unavailable'));
      },
    });
    await expect(session.refresh()).resolves.toEqual(updated);
    expect(vi.getTimerCount()).toBe(1);
    session.close();
  });

  it('bounds transient retries and surfaces terminal failure without a successful callback', async () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const refresh = vi.fn(async () => {
      throw new TransportError('unavailable');
    });
    const session = new AuthSession({
      credentials: tokens(),
      refresh,
      onCredentialsChanged: changed,
    });
    const result = session.refresh();
    const assertion = expect(result).rejects.toThrow('unavailable');
    await vi.advanceTimersByTimeAsync(750);
    await assertion;
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(changed).not.toHaveBeenCalled();
    await expect(session.ready()).rejects.toThrow('unavailable');
    session.close();
  });

  it('rejects changed identity and expired replacements without adoption', async () => {
    const original = tokens();
    const changed = vi.fn();
    const bad = tokens(1, -1);
    const session = new AuthSession({
      credentials: original,
      refresh: async () => bad,
      onCredentialsChanged: changed,
    });
    await expect(session.refresh()).rejects.toBeInstanceOf(
      RequestRejectedError,
    );
    expect(session.credentials).toEqual(original);
    expect(changed).not.toHaveBeenCalled();
    session.close();
  });

  it('logout wins over a late refresh even if the dependency ignores cancellation', async () => {
    const original = tokens();
    const changed = vi.fn();
    const pending = Promise.withResolvers<BearerCredentials>();
    const session = new AuthSession({
      credentials: original,
      refresh: () => pending.promise,
      onCredentialsChanged: changed,
    });
    const refreshing = session.refresh();
    session.close();
    pending.resolve(tokens(1));
    await expect(refreshing).rejects.toThrow('closed');
    expect(session.credentials).toEqual(original);
    expect(changed).not.toHaveBeenCalled();
  });

  it('cancelling one waiter preserves the refresh shared by other operations', async () => {
    const pending = Promise.withResolvers<BearerCredentials>();
    const original = tokens();
    const session = new AuthSession({
      credentials: original,
      refresh: () => pending.promise,
    });
    const abort = new AbortController();
    const cancelled = session.recover(original.accessToken, abort.signal);
    const other = session.refresh();
    abort.abort();
    await expect(cancelled).rejects.toMatchObject({
      name: 'RequestAbortedError',
    });
    const updated = tokens(1);
    pending.resolve(updated);
    await expect(other).resolves.toEqual(updated);
    session.close();
  });
});

it('revokes with a still-valid bearer despite a cached transient refresh failure', async () => {
  vi.useFakeTimers();
  const original = tokens();
  const refresh = vi.fn(async () => {
    throw new TransportError('temporarily unavailable');
  });
  const changed = vi.fn();
  const session = new AuthSession({
    credentials: original,
    refresh,
    onCredentialsChanged: changed,
  });
  const failed = expect(session.refresh()).rejects.toThrow(
    'temporarily unavailable',
  );
  await vi.advanceTimersByTimeAsync(750);
  await failed;
  const revoke = vi.fn(async () => undefined);
  await session.logout(revoke);
  expect(revoke).toHaveBeenCalledExactlyOnceWith(original.accessToken);
  expect(refresh).toHaveBeenCalledTimes(3);
  expect(changed).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  { status: 401, code: 'expired_access_token', attempts: 2 },
  { status: 401, code: 'invalid_access_token', attempts: 1 },
  { status: 503, code: 'identity_provider_unavailable', attempts: 1 },
])('bounds logout replay for $status/$code', async ({
  status,
  code,
  attempts,
}) => {
  const refresh = vi.fn(async () => tokens(1));
  const session = new AuthSession({ credentials: tokens(), refresh });
  const revoke = vi.fn(async () => {
    throw new RequestRejectedError('Rejected', { status, code });
  });
  await expect(session.logout(revoke)).rejects.toMatchObject({ status, code });
  expect(revoke).toHaveBeenCalledTimes(attempts);
  expect(refresh).toHaveBeenCalledTimes(attempts - 1);
  expect(() => session.assertActive()).toThrow('closed');
});

it('does not adopt an ordinary refresh that completes while revocation is pending', async () => {
  vi.useFakeTimers();
  const original = tokens();
  const pendingRefresh = Promise.withResolvers<BearerCredentials>();
  const pendingRevocation = Promise.withResolvers<void>();
  const changed = vi.fn();
  let refreshSignal: AbortSignal | undefined;
  const session = new AuthSession({
    credentials: original,
    onCredentialsChanged: changed,
    refresh: async (_credentials, signal) => {
      refreshSignal = signal;
      return pendingRefresh.promise;
    },
  });
  const ordinaryRefresh = session.refresh();
  const failed = expect(ordinaryRefresh).rejects.toThrow('closed');
  const ending = session.logout(async () => pendingRevocation.promise);
  expect(refreshSignal?.aborted).toBe(true);
  pendingRefresh.resolve(tokens(1));
  await failed;
  pendingRevocation.resolve();
  await ending;
  expect(session.credentials).toEqual(original);
  expect(changed).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
