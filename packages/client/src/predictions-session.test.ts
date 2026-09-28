import { SignatureType } from '@polymarket/bindings/clob';
import type { PredictionsIdentity } from '@polymarket/bindings/gateway';
import { expectEvmAddress } from '@polymarket/types';
import { describe, expect, it, vi } from 'vitest';
import { TransportError } from './errors';
import {
  PredictionsSessionClosedError,
  type PredictionsSessionCredentials,
  PredictionsSessionManager,
} from './predictions-session';

const identity: PredictionsIdentity = {
  signer: expectEvmAddress('0x1111111111111111111111111111111111111111'),
  wallet: expectEvmAddress('0x1111111111111111111111111111111111111111'),
  signatureType: SignatureType.EOA,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function credentials(
  accessToken = 'access-one',
): PredictionsSessionCredentials {
  return {
    accessToken,
    refreshToken: 'refresh-one',
    refreshAt: 70_000,
    refreshExpiresAt: 1_000_000,
  };
}

function sessionPolicy() {
  let now = 0;
  const open = vi.fn(async () => credentials());
  const refresh = vi.fn(async () => credentials('access-two'));
  const fetchIdentity = vi.fn(async () => identity);
  const logout = vi.fn(async (): Promise<void> => undefined);
  const manager = new PredictionsSessionManager({
    open,
    refresh,
    fetchIdentity,
    logout,
    now: () => now,
  });
  return {
    manager,
    open,
    refresh,
    fetchIdentity,
    logout,
    setTime(value: number) {
      now = value;
    },
  };
}

describe('predictions session policy', () => {
  it('shares concurrent opening and reuses the active handle', async () => {
    const policy = sessionPolicy();
    const opening = deferred<PredictionsSessionCredentials>();
    policy.open.mockReturnValue(opening.promise);
    const first = policy.manager.open();
    const second = policy.manager.open();
    expect(policy.open).toHaveBeenCalledTimes(1);
    opening.resolve(credentials());
    const session = await first;
    expect(await second).toBe(session);
    expect(await policy.manager.open()).toBe(session);
  });

  it('allows an explicit opening attempt after opening fails', async () => {
    const policy = sessionPolicy();
    policy.open.mockRejectedValueOnce(new TransportError('Unavailable'));
    await expect(policy.manager.open()).rejects.toBeInstanceOf(TransportError);
    await policy.manager.open();
    expect(policy.open).toHaveBeenCalledTimes(2);
  });

  it('refreshes on demand once for concurrent reads', async () => {
    const policy = sessionPolicy();
    const session = await policy.manager.open();
    await session.fetchIdentity();
    expect(policy.refresh).not.toHaveBeenCalled();
    policy.setTime(70_000);
    const refreshing = deferred<PredictionsSessionCredentials>();
    policy.refresh.mockReturnValue(refreshing.promise);
    const first = session.fetchIdentity();
    const second = session.fetchIdentity();
    expect(policy.refresh).toHaveBeenCalledTimes(1);
    expect(policy.fetchIdentity).toHaveBeenCalledTimes(1);
    refreshing.resolve({ ...credentials('access-two'), refreshAt: 140_000 });
    await Promise.all([first, second]);
    expect(policy.fetchIdentity).toHaveBeenLastCalledWith('access-two');
  });

  it('blocks reads after failed refresh and permits a later explicit retry', async () => {
    const policy = sessionPolicy();
    const session = await policy.manager.open();
    policy.setTime(70_000);
    policy.refresh.mockRejectedValueOnce(new TransportError('Unavailable'));
    await expect(session.fetchIdentity()).rejects.toBeInstanceOf(
      TransportError,
    );
    expect(policy.fetchIdentity).not.toHaveBeenCalled();
    await session.fetchIdentity();
    expect(policy.refresh).toHaveBeenCalledTimes(2);
    expect(policy.fetchIdentity).toHaveBeenCalledTimes(1);
    expect(policy.open).toHaveBeenCalledTimes(1);
  });

  it('ends locally before logout completes and allows another session', async () => {
    const policy = sessionPolicy();
    const session = await policy.manager.open();
    const loggingOut = deferred<void>();
    policy.logout.mockReturnValueOnce(loggingOut.promise);
    const first = session.logout();
    const second = session.logout();
    await expect(session.fetchIdentity()).rejects.toBeInstanceOf(
      PredictionsSessionClosedError,
    );
    expect(policy.logout).toHaveBeenCalledTimes(1);
    expect(await policy.manager.open()).not.toBe(session);
    loggingOut.resolve();
    await Promise.all([first, second]);
    await session.logout();
    expect(policy.logout).toHaveBeenCalledTimes(1);
  });

  it('keeps logout retryable after failure without restoring local access', async () => {
    const policy = sessionPolicy();
    const session = await policy.manager.open();
    policy.logout.mockRejectedValueOnce(new TransportError('Unavailable'));
    await expect(session.logout()).rejects.toBeInstanceOf(TransportError);
    await expect(session.fetchIdentity()).rejects.toBeInstanceOf(
      PredictionsSessionClosedError,
    );
    await session.logout();
    expect(policy.logout).toHaveBeenNthCalledWith(2, 'refresh-one');
    expect(policy.refresh).not.toHaveBeenCalled();
  });

  it('does not let an in-flight refresh restore a logged-out handle', async () => {
    const policy = sessionPolicy();
    const session = await policy.manager.open();
    policy.setTime(70_000);
    const refreshing = deferred<PredictionsSessionCredentials>();
    policy.refresh.mockReturnValue(refreshing.promise);
    const reading = session.fetchIdentity();
    const rejectedRead = expect(reading).rejects.toBeInstanceOf(
      PredictionsSessionClosedError,
    );
    await session.logout();
    refreshing.resolve(credentials('late-token'));
    await rejectedRead;
    expect(policy.fetchIdentity).not.toHaveBeenCalled();
    await expect(session.fetchIdentity()).rejects.toBeInstanceOf(
      PredictionsSessionClosedError,
    );
  });

  it('rejects an identity result arriving after logout', async () => {
    const policy = sessionPolicy();
    const session = await policy.manager.open();
    const identityRead = deferred<PredictionsIdentity>();
    policy.fetchIdentity.mockReturnValue(identityRead.promise);
    const reading = session.fetchIdentity();
    await Promise.resolve();
    await session.logout();
    identityRead.resolve(identity);
    await expect(reading).rejects.toBeInstanceOf(PredictionsSessionClosedError);
  });

  it('requires a new session after refresh credentials expire', async () => {
    const policy = sessionPolicy();
    const session = await policy.manager.open();
    policy.setTime(1_000_000);
    await expect(session.fetchIdentity()).rejects.toBeInstanceOf(
      PredictionsSessionClosedError,
    );
    expect(policy.refresh).not.toHaveBeenCalled();
    expect(policy.fetchIdentity).not.toHaveBeenCalled();
    expect(await policy.manager.open()).not.toBe(session);
    await session.logout();
    expect(policy.logout).toHaveBeenCalledWith('refresh-one');
  });
});
