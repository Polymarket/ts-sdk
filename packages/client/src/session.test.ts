import type { BearerCredentials } from '@polymarket/bindings';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestRejectedError, TransportError } from './errors';
import { AuthSession } from './session';

const sub = '0x0000000000000000000000000000000000000001';
function tokens(sequence = 0, seconds = 900, subject = sub): BearerCredentials {
  return {
    accessToken: `test.${btoa(JSON.stringify({ sub: subject, client_id: 'synthetic-client', exp: Math.floor(Date.now() / 1000) + seconds, jti: sequence }))}.test`,
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

  it('bounds transient retries, surfaces terminal failure, and still revokes a valid bearer', async () => {
    vi.useFakeTimers();
    const original = tokens();
    const changed = vi.fn();
    const refresh = vi.fn(async () => {
      throw new TransportError('unavailable');
    });
    const session = new AuthSession({
      credentials: original,
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
    const revoke = vi.fn(async () => undefined);
    await session.logout(revoke);
    expect(revoke).toHaveBeenCalledExactlyOnceWith(original.accessToken);
    expect(session.credentials).toEqual(original);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(changed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    'identity',
    'expiry',
  ])('rejects changed %s without adoption', async (kind) => {
    const original = tokens();
    const changed = vi.fn();
    const bad =
      kind === 'expiry'
        ? tokens(1, -1)
        : tokens(1, 900, '0x0000000000000000000000000000000000000002');
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

  it('close rejects a started refresh even if the dependency ignores cancellation', async () => {
    const original = tokens();
    const changed = vi.fn();
    const pending = Promise.withResolvers<BearerCredentials>();
    const started = Promise.withResolvers<void>();
    const session = new AuthSession({
      credentials: original,
      refresh: () => {
        started.resolve();
        return pending.promise;
      },
      onCredentialsChanged: changed,
    });
    const refreshing = session.refresh();
    await started.promise;
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

it.each([
  900, -1,
])('drains in-flight rotation for logout (expiry %s) without adoption or duplicate refresh', async (expiry) => {
  vi.useFakeTimers();
  const original = tokens(0, expiry);
  const updated = tokens(1);
  const pendingRefresh = Promise.withResolvers<BearerCredentials>();
  const pendingRevocation = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const changed = vi.fn();
  let refreshSignal: AbortSignal | undefined;
  const refresh = vi.fn(
    (_credentials: BearerCredentials, signal: AbortSignal) => {
      refreshSignal = signal;
      started.resolve();
      return pendingRefresh.promise;
    },
  );
  const session = new AuthSession({
    credentials: original,
    refresh,
    onCredentialsChanged: changed,
  });
  const failed = expect(session.refresh()).rejects.toThrow('closed');
  await started.promise;
  const revoke = vi.fn(() => pendingRevocation.promise);
  const ending = session.logout(revoke);
  expect(() => session.assertActive()).toThrow('closed');
  expect(refreshSignal?.aborted).toBe(false);
  expect(revoke).not.toHaveBeenCalled();
  pendingRefresh.resolve(updated);
  await failed;
  expect(revoke).toHaveBeenCalledExactlyOnceWith(updated.accessToken);
  pendingRevocation.resolve();
  await ending;
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(refreshSignal?.aborted).toBe(true);
  expect(session.credentials).toEqual(original);
  expect(changed).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('waits for an explicit refresh even while the current bearer is fresh', async () => {
  const pending = Promise.withResolvers<BearerCredentials>();
  const started = Promise.withResolvers<void>();
  const original = tokens();
  const refresh = vi.fn(() => {
    started.resolve();
    return pending.promise;
  });
  const session = new AuthSession({ credentials: original, refresh });
  const operation = session.refresh();
  expect(session.refresh()).toBe(operation);
  await started.promise;
  const ready = vi.fn((pair: BearerCredentials) => pair);
  const recovered = vi.fn();
  const consumer = session.ready().then(ready);
  const late401 = session.recover('already-superseded-token').then(recovered);
  await Promise.resolve();
  expect(ready).not.toHaveBeenCalled();
  expect(recovered).not.toHaveBeenCalled();
  const updated = tokens(1);
  pending.resolve(updated);
  await expect(consumer).resolves.toEqual(updated);
  await late401;
  expect(refresh).toHaveBeenCalledExactlyOnceWith(
    original,
    expect.any(AbortSignal),
  );
  session.close();
});

it('installs the lock before a refresh callback can synchronously reenter', async () => {
  let reentrant: Promise<BearerCredentials> | undefined;
  const updated = tokens(1);
  const refresh = vi.fn(async () => {
    reentrant = session.refresh();
    return updated;
  });
  const session = new AuthSession({ credentials: tokens(), refresh });
  const operation = session.refresh();
  await expect(operation).resolves.toEqual(updated);
  expect(reentrant).toBe(operation);
  expect(refresh).toHaveBeenCalledTimes(1);
  session.close();
});

it.each([
  900, -1,
])('does not replay a refresh with uncertain outcome during logout (expiry %s)', async (expiry) => {
  const original = tokens(0, expiry);
  const pending = Promise.withResolvers<BearerCredentials>();
  const started = Promise.withResolvers<void>();
  const refresh = vi.fn(() => {
    started.resolve();
    return pending.promise;
  });
  const session = new AuthSession({ credentials: original, refresh });
  const ordinary = expect(session.refresh()).rejects.toThrow('closed');
  await started.promise;
  const revoke = vi.fn(async () => undefined);
  const logout = session.logout(revoke);
  const outcome =
    expiry > 0
      ? expect(logout).resolves.toBeUndefined()
      : expect(logout).rejects.toThrow('uncertain');
  pending.reject(new TransportError('uncertain'));
  await Promise.all([ordinary, outcome]);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledTimes(expiry > 0 ? 1 : 0);
});

it.each([
  { expiry: 900, rejectedRevocation: false },
  { expiry: -1, rejectedRevocation: false },
  { expiry: 900, rejectedRevocation: true },
])('does not replay uncertain rotation during backoff (expiry $expiry, rejected revocation $rejectedRevocation)', async ({
  expiry,
  rejectedRevocation,
}) => {
  vi.useFakeTimers();
  const original = tokens(0, expiry);
  const uncertain = new TransportError('uncertain rotation');
  const refresh = vi.fn(async () => tokens(1)).mockRejectedValueOnce(uncertain);
  const changed = vi.fn();
  const session = new AuthSession({
    credentials: original,
    refresh,
    onCredentialsChanged: changed,
  });
  const ordinary = expect(session.refresh()).rejects.toThrow('stopped');
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(1); // The first attempt has entered retry backoff.
  const revoke = vi.fn(async () => {
    if (rejectedRevocation)
      throw new RequestRejectedError('expired', {
        status: 401,
        code: 'expired_access_token',
      });
  });
  const logout = session.logout(revoke);
  if (expiry < 0) await expect(logout).rejects.toBe(uncertain);
  else if (rejectedRevocation)
    await expect(logout).rejects.toMatchObject({ status: 401 });
  else await expect(logout).resolves.toBeUndefined();
  await ordinary;
  await vi.advanceTimersByTimeAsync(1_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledTimes(expiry > 0 ? 1 : 0);
  if (expiry > 0) expect(revoke).toHaveBeenCalledWith(original.accessToken);
  expect(session.credentials).toEqual(original);
  expect(changed).not.toHaveBeenCalled();
  expect(() => session.assertActive()).toThrow('closed');
  expect(vi.getTimerCount()).toBe(0);
});

it('closing before a queued refresh starts skips its callback and preserves replacement credentials', async () => {
  const refresh = vi.fn(async () => tokens(1));
  const old = new AuthSession({ credentials: tokens(), refresh });
  const ordinary = expect(old.refresh()).rejects.toThrow('closed');
  old.close();
  const replacement = new AuthSession({ credentials: tokens(2), refresh });
  await ordinary;
  expect(refresh).not.toHaveBeenCalled();
  expect(replacement.credentials).toEqual(tokens(2));
  replacement.close();
});
