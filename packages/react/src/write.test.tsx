import type { ApiKeyCreds, BaseSecureClient } from '@polymarket/client';
import { production, RequestRejectedError } from '@polymarket/client';
import { expectEvmAddress } from '@polymarket/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
// Test-only deep import: derive a valid Deposit Wallet fixture without a network.
import { deriveBeaconDepositWalletAddress } from '../../client/src/wallet';
import { useAuthentication } from './authentication';
import { createConfig } from './config';
import { PolymarketProvider } from './context';
import { UnauthenticatedError } from './errors';
import type { Session } from './session';
import { useSecureWrite } from './write';

const config = createConfig();
const address = expectEvmAddress(`0x${'1'.repeat(40)}`);

const session: Session = {
  address,
  wallet: deriveBeaconDepositWalletAddress(
    address,
    production.walletDerivation,
  ),
  credentials: {
    key: 'key' as ApiKeyCreds['key'],
    passphrase: 'passphrase',
    secret: 'secret',
  },
};

function createWrapper(initialSession?: Session) {
  return function wrapper({ children }: { children: ReactNode }) {
    return (
      <PolymarketProvider config={config} initialSession={initialSession}>
        {children}
      </PolymarketProvider>
    );
  };
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useSecureWrite', () => {
  it('runs against the session client and reports steps', async () => {
    const signing = createDeferred<string>();

    async function run(
      client: BaseSecureClient,
      onStep: (kind: 'signOrder') => void,
      value: string,
    ): Promise<string> {
      expect(client.isSecureClient()).toBe(true);
      onStep('signOrder');
      const signature = await signing.promise;
      return `done:${value}:${signature}`;
    }

    const { result } = renderHook(() => useSecureWrite(run), {
      wrapper: createWrapper(session),
    });

    let execution: Promise<string> | undefined;

    act(() => {
      execution = result.current[0]('a');
    });

    await waitFor(() => expect(result.current[1].step).toBe('signOrder'));
    expect(result.current[1].status).toBe('pending');

    await act(async () => {
      signing.resolve('sig');
      await expect(execution).resolves.toBe('done:a:sig');
    });

    expect(result.current[1].status).toBe('success');
    expect(result.current[1].data).toBe('done:a:sig');
    expect(result.current[1].step).toBeUndefined();
  });

  it('rejects with UnauthenticatedError while unauthenticated', async () => {
    const run = vi.fn(
      async (_client: BaseSecureClient, _onStep: (kind: never) => void) =>
        'unreachable',
    );

    const { result } = renderHook(() => useSecureWrite(run), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(result.current[0]()).rejects.toThrow(UnauthenticatedError);
    });

    expect(result.current[1].status).toBe('error');
    expect(result.current[1].error).toBeInstanceOf(UnauthenticatedError);
    expect(run).not.toHaveBeenCalled();
  });

  it('surfaces failures on error state and rethrows', async () => {
    const failure = new Error('exchange rejected');

    async function run(
      _client: BaseSecureClient,
      _onStep: (kind: never) => void,
    ): Promise<string> {
      throw failure;
    }

    const { result } = renderHook(() => useSecureWrite(run), {
      wrapper: createWrapper(session),
    });

    await act(async () => {
      await expect(result.current[0]()).rejects.toBe(failure);
    });

    expect(result.current[1].status).toBe('error');
    expect(result.current[1].error).toBe(failure);
  });

  it('ends the session when the write is rejected as unauthorized', async () => {
    const rejection = new RequestRejectedError('unauthorized', { status: 401 });

    async function run(
      _client: BaseSecureClient,
      _onStep: (kind: never) => void,
    ): Promise<string> {
      throw rejection;
    }

    const { result } = renderHook(
      () => ({
        auth: useAuthentication(),
        write: useSecureWrite(run),
      }),
      { wrapper: createWrapper(session) },
    );

    await act(async () => {
      await expect(result.current.write[0]()).rejects.toBe(rejection);
    });

    await waitFor(() =>
      expect(result.current.auth.status).toBe('unauthenticated'),
    );
    expect(result.current.auth.error).toBe(rejection);
  });

  it('discards in-flight executions after reset', async () => {
    const deferred = createDeferred<string>();

    async function run(
      _client: BaseSecureClient,
      _onStep: (kind: never) => void,
    ): Promise<string> {
      return deferred.promise;
    }

    const { result } = renderHook(() => useSecureWrite(run), {
      wrapper: createWrapper(session),
    });

    let execution: Promise<string> | undefined;

    act(() => {
      execution = result.current[0]();
    });
    expect(result.current[1].status).toBe('pending');

    act(() => {
      result.current[1].reset();
    });
    expect(result.current[1].status).toBe('idle');

    await act(async () => {
      deferred.resolve('late');
      await execution;
    });

    // The late result settles the promise but not the state.
    expect(result.current[1].status).toBe('idle');
    expect(result.current[1].data).toBeUndefined();
  });

  it('keeps only the latest concurrent execution in state', async () => {
    const first = createDeferred<string>();
    const second = createDeferred<string>();
    const deferreds = [first, second];
    let call = 0;

    async function run(
      _client: BaseSecureClient,
      _onStep: (kind: never) => void,
    ): Promise<string> {
      const deferred = deferreds[call];
      call += 1;
      return deferred?.promise ?? Promise.reject(new Error('unexpected call'));
    }

    const { result } = renderHook(() => useSecureWrite(run), {
      wrapper: createWrapper(session),
    });

    let firstExecution: Promise<string> | undefined;

    act(() => {
      firstExecution = result.current[0]();
    });
    let secondExecution: Promise<string> | undefined;
    act(() => {
      secondExecution = result.current[0]();
    });

    await act(async () => {
      second.resolve('second');
      await secondExecution;
    });
    expect(result.current[1].data).toBe('second');

    await act(async () => {
      first.resolve('first');
      await firstExecution;
    });

    // The stale first execution resolves its promise but not the state.
    expect(result.current[1].data).toBe('second');
  });
});
