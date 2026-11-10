import type { BearerCredentials, TokenResponse } from '@polymarket/bindings';
import { expectEvmAddress } from '@polymarket/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
} from './errors';
import { AuthSession } from './session';

const sub = '0x0000000000000000000000000000000000000001';
const wallet = expectEvmAddress('0x0000000000000000000000000000000000000002');
function tokens(
  sequence = 0,
  seconds = 900,
  claims: Record<string, unknown> = {},
): BearerCredentials {
  return {
    accessToken: `test.${btoa(JSON.stringify({ sub, client_id: 'synthetic-client', exp: Math.floor(Date.now() / 1000) + seconds, jti: sequence, ...claims }))}.test`,
    refreshToken: `synthetic-refresh-${sequence}`,
  };
}
function issue(pair: BearerCredentials, expiresIn = 900): TokenResponse {
  return { ...pair, expiresIn };
}
afterEach(() => vi.useRealTimers());

describe('shared session policy', () => {
  it('single-flights timer, HTTP and socket callers, adopts both tokens, and notifies after adoption', async () => {
    vi.useFakeTimers();
    const original = tokens();
    const deferred = Promise.withResolvers<TokenResponse>();
    const refresh = vi.fn(() => deferred.promise);
    const changed = vi.fn(async (pair: BearerCredentials) => {
      expect(session.credentials).toEqual(pair);
    });
    const session = new AuthSession({
      credentials: original,
      expiresIn: 900,
      refresh,
      onCredentialsChanged: changed,
    });
    session.start();
    await vi.advanceTimersByTimeAsync(870_000);
    const http = session.recover(original.accessToken);
    const socket = session.ready();
    const updated = tokens(1);
    deferred.resolve(issue(updated));
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
      refresh: async () => issue(updated),
      onCredentialsChanged: () => {
        if (kind === 'sync') throw new Error('storage unavailable');
        return Promise.reject(new Error('storage unavailable'));
      },
    });
    await expect(session.refresh()).resolves.toEqual(updated);
    expect(vi.getTimerCount()).toBe(1);
    session.close();
  });

  it('keeps the session through transient renewal failures and renews on the retry timer', async () => {
    vi.useFakeTimers();
    const original = tokens();
    const updated = tokens(1);
    const changed = vi.fn();
    const failed = vi.fn();
    const refresh = vi
      .fn<() => Promise<TokenResponse>>()
      .mockRejectedValueOnce(new TransportError('unavailable'))
      .mockRejectedValueOnce(
        new RequestRejectedError('Unavailable', { status: 503 }),
      )
      .mockRejectedValueOnce(new TransportError('unavailable'))
      .mockResolvedValueOnce(issue(updated));
    const session = new AuthSession({
      credentials: original,
      expiresIn: 900,
      refresh,
      onCredentialsChanged: changed,
    });
    session.onFailure(failed);
    session.start();
    await vi.advanceTimersByTimeAsync(870_750);
    expect(refresh).toHaveBeenCalledTimes(3);
    // The current bearer is still valid, so callers keep working while renewal backs off.
    await expect(session.ready()).resolves.toEqual(original);
    expect(refresh).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(refresh).toHaveBeenCalledTimes(4);
    expect(session.credentials).toEqual(updated);
    expect(changed).toHaveBeenCalledExactlyOnceWith(updated);
    expect(failed).not.toHaveBeenCalled();
    session.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ends the session on a definite rejection and still revokes a valid bearer', async () => {
    vi.useFakeTimers();
    const original = tokens();
    const rejection = new RequestRejectedError('Rejected', {
      status: 401,
      code: 'invalid_refresh_token',
    });
    const refresh = vi.fn(async () => {
      throw rejection;
    });
    const failed = vi.fn();
    const session = new AuthSession({ credentials: original, refresh });
    session.onFailure(failed);
    await expect(session.refresh()).rejects.toBe(rejection);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledExactlyOnceWith(rejection);
    await expect(session.ready()).rejects.toBe(rejection);
    const revoke = vi.fn(async () => undefined);
    await session.logout(revoke);
    expect(revoke).toHaveBeenCalledExactlyOnceWith(original.accessToken);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('schedules renewal from the issued lifetime rather than the local clock', async () => {
    vi.useFakeTimers();
    // The local clock runs 20 minutes ahead of the server, so `exp` looks past.
    const skew = 1_200;
    const original = tokens(0, 900 - skew);
    const updated = tokens(1, 900 - skew);
    const refresh = vi.fn(async () => issue(updated));
    const session = new AuthSession({
      credentials: original,
      expiresIn: 900,
      refresh,
    });
    session.start();
    await expect(session.ready()).resolves.toEqual(original);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(870_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(session.credentials).toEqual(updated);
    await expect(session.ready()).resolves.toEqual(updated);
    session.close();
  });

  it.each([
    'identity',
    'expiry',
  ])('ends the session when renewal returns a changed %s', async (kind) => {
    const original = tokens();
    const changed = vi.fn();
    const bad =
      kind === 'expiry'
        ? issue(tokens(1), 10)
        : issue(
            tokens(1, 900, {
              sub: '0x0000000000000000000000000000000000000003',
            }),
          );
    const session = new AuthSession({
      credentials: original,
      refresh: async () => bad,
      onCredentialsChanged: changed,
    });
    await expect(session.refresh()).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
    expect(session.credentials).toEqual(original);
    expect(changed).not.toHaveBeenCalled();
    expect(() => session.assertActive()).toThrow(UnexpectedResponseError);
    session.close();
  });

  it('binds a wallet by adopting the upgraded access token and keeping the refresh token', async () => {
    const original = tokens();
    const upgraded = tokens(1, 900, { wallet, signature_type: 3 });
    const changed = vi.fn();
    const session = new AuthSession({
      credentials: original,
      refresh: vi.fn(),
      onCredentialsChanged: changed,
    });
    const upgrade = vi.fn(async () => ({
      accessToken: upgraded.accessToken,
      expiresIn: 900,
    }));
    await session.bindWallet(wallet, upgrade);
    expect(upgrade).toHaveBeenCalledExactlyOnceWith(original.accessToken);
    const bound = {
      accessToken: upgraded.accessToken,
      refreshToken: original.refreshToken,
    };
    expect(session.credentials).toEqual(bound);
    expect(changed).toHaveBeenCalledExactlyOnceWith(bound);
    await expect(
      session.bindWallet(
        expectEvmAddress('0x0000000000000000000000000000000000000004'),
        upgrade,
      ),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
    session.close();
  });

  it('close rejects a started refresh even if the dependency ignores cancellation', async () => {
    const original = tokens();
    const changed = vi.fn();
    const pending = Promise.withResolvers<TokenResponse>();
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
    pending.resolve(issue(tokens(1)));
    await expect(refreshing).rejects.toThrow('closed');
    expect(session.credentials).toEqual(original);
    expect(changed).not.toHaveBeenCalled();
  });

  it('cancelling one waiter preserves the refresh shared by other operations', async () => {
    const pending = Promise.withResolvers<TokenResponse>();
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
    pending.resolve(issue(updated));
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
  const refresh = vi.fn(async () => issue(tokens(1)));
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
  const pendingRefresh = Promise.withResolvers<TokenResponse>();
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
  pendingRefresh.resolve(issue(tokens(1)));
  await failed;
  pendingRevocation.resolve();
  await ending;
  expect(session.credentials).toEqual(original);
  expect(changed).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
