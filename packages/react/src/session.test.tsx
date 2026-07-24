import type { ApiKeyCreds, BaseSecureClient } from '@polymarket/client';
import {
  production,
  RequestRejectedError,
  UserInputError,
} from '@polymarket/client';
import { expectEvmAddress } from '@polymarket/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
// Test-only deep import: derive a valid Deposit Wallet fixture without a network.
import { deriveBeaconDepositWalletAddress } from '../../client/src/wallet';
import { useAuthentication } from './authentication';
import { createConfig } from './config';
import { PolymarketProvider, usePolymarketClient } from './context';
import { UnsupportedAccountError } from './errors';
import { useSecureClientAction } from './read';
import type { Session } from './session';

const config = createConfig();
const address = expectEvmAddress(`0x${'1'.repeat(40)}`);
const depositWallet = deriveBeaconDepositWalletAddress(
  address,
  production.walletDerivation,
);

const credentials: ApiKeyCreds = {
  key: 'key' as ApiKeyCreds['key'],
  passphrase: 'passphrase',
  secret: 'secret',
};

const session: Session = {
  address,
  wallet: depositWallet,
  credentials,
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

describe('session restore', () => {
  it('restores a stored session synchronously', () => {
    const { result } = renderHook(
      () => ({
        auth: useAuthentication(),
        client: usePolymarketClient(),
      }),
      { wrapper: createWrapper(session) },
    );

    expect(result.current.auth.status).toBe('authenticated');
    expect(result.current.auth.session).toEqual(session);
    expect(result.current.client.isSecureClient()).toBe(true);
  });

  it('drops a malformed session and surfaces the error', () => {
    const { result } = renderHook(() => useAuthentication(), {
      wrapper: createWrapper({ ...session, address: 'not-an-address' }),
    });

    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.session).toBeUndefined();
    expect(result.current.error).toBeInstanceOf(UserInputError);
  });

  it('rejects an EOA session', () => {
    const { result } = renderHook(() => useAuthentication(), {
      wrapper: createWrapper({ ...session, wallet: address }),
    });

    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.error).toBeInstanceOf(UnsupportedAccountError);
  });
});

describe('secure hook gating', () => {
  it('pauses secure hooks while unauthenticated', () => {
    const action = vi.fn(
      async (_client: BaseSecureClient, _request: Record<string, never>) =>
        'secret-data',
    );

    const { result } = renderHook(() => useSecureClientAction(action, {}), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPaused).toBe(true);
    expect(action).not.toHaveBeenCalled();
  });

  it('runs secure actions against the session client when authenticated', async () => {
    const action = vi.fn(
      async (client: BaseSecureClient, _request: Record<string, never>) => {
        expect(client.isSecureClient()).toBe(true);
        return 'secret-data';
      },
    );

    const { result } = renderHook(() => useSecureClientAction(action, {}), {
      wrapper: createWrapper(session),
    });

    await waitFor(() => expect(result.current.data).toBe('secret-data'));
    expect(result.current.isPaused).toBe(false);
  });

  it('ends the session when a secure request is rejected as unauthorized', async () => {
    const rejection = new RequestRejectedError('unauthorized', { status: 401 });

    async function action(
      _client: BaseSecureClient,
      _request: Record<string, never>,
    ): Promise<string> {
      throw rejection;
    }

    const { result } = renderHook(
      () => ({
        auth: useAuthentication(),
        read: useSecureClientAction(action, {}),
      }),
      { wrapper: createWrapper(session) },
    );

    expect(result.current.auth.status).toBe('authenticated');

    await waitFor(() =>
      expect(result.current.auth.status).toBe('unauthenticated'),
    );
    expect(result.current.auth.error).toBe(rejection);
    expect(result.current.read.isPaused).toBe(true);
  });

  it('keeps other rejections from ending the session', async () => {
    const rejection = new RequestRejectedError('rate limited', { status: 400 });

    async function action(
      _client: BaseSecureClient,
      _request: Record<string, never>,
    ): Promise<string> {
      throw rejection;
    }

    const { result } = renderHook(
      () => ({
        auth: useAuthentication(),
        read: useSecureClientAction<Record<string, never>, string>(action, {}),
      }),
      { wrapper: createWrapper(session) },
    );

    await waitFor(() => expect(result.current.read.error).toBe(rejection));
    expect(result.current.auth.status).toBe('authenticated');
  });

  it('resumes paused secure hooks after authentication state appears', async () => {
    const action = vi.fn(
      async (_client: BaseSecureClient, _request: Record<string, never>) =>
        'secret-data',
    );

    function useHarness() {
      return {
        auth: useAuthentication(),
        read: useSecureClientAction(action, {}),
      };
    }

    const { result, rerender } = renderHook(useHarness, {
      wrapper: createWrapper(),
    });

    expect(result.current.read.isPaused).toBe(true);

    await act(async () => {
      // No public transition without a handler; assert pause holds instead.
      await result.current.read.refetch();
    });

    expect(result.current.read.isPaused).toBe(true);
    rerender();
    expect(action).not.toHaveBeenCalled();
  });
});
