import type { ApiKeyCreds } from '@polymarket/client';
import {
  CancelledSigningError,
  forkEnvironmentConfig,
} from '@polymarket/client';
import { expectEvmAddress, expectEvmSignature } from '@polymarket/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
// Test-only deep import: derive the expected Deposit Wallet without a network.
import { deriveBeaconDepositWalletAddress } from '../../client/src/wallet';
import { useAuthentication } from './authentication';
import { createConfig } from './config';
import { PolymarketProvider, usePolymarketClient } from './context';
import { UnsupportedAccountError } from './errors';
import type { WorkflowHandler } from './workflow';

const clobRoot = 'http://localhost:4116';
const relayerRoot = 'http://localhost:4115';
const server = setupServer();

const environment = forkEnvironmentConfig({
  name: 'test',
  clob: { rest: clobRoot },
  relayer: { rest: relayerRoot },
});

const config = createConfig({ environment });
const address = expectEvmAddress(`0x${'1'.repeat(40)}`);
const signature = expectEvmSignature(`0x${'2'.repeat(130)}`);
const depositWallet = deriveBeaconDepositWalletAddress(
  address,
  environment.walletDerivation,
);

const credentials: ApiKeyCreds = {
  key: 'key' as ApiKeyCreds['key'],
  passphrase: 'passphrase',
  secret: 'secret',
};

function wrapper({ children }: { children: ReactNode }) {
  return <PolymarketProvider config={config}>{children}</PolymarketProvider>;
}

function createHandler(): WorkflowHandler & { kinds: string[] } {
  const kinds: string[] = [];

  const handler: WorkflowHandler = async (request) => {
    kinds.push(request.kind);
    return request.kind === 'requestAddress' ? address : signature;
  };

  return Object.assign(handler, { kinds });
}

function useHarness(handler: WorkflowHandler) {
  return {
    auth: useAuthentication(handler),
    client: usePolymarketClient(),
  };
}

function stubHappyPathEndpoints() {
  server.use(
    http.get(`${relayerRoot}/deployed`, () =>
      HttpResponse.json({ deployed: false }),
    ),
    http.post(`${clobRoot}/auth/api-key`, () =>
      HttpResponse.json({
        apiKey: credentials.key,
        passphrase: credentials.passphrase,
        secret: credentials.secret,
      }),
    ),
  );
}

describe('useAuthentication', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('establishes a session through the workflow handler', async () => {
    stubHappyPathEndpoints();
    const handler = createHandler();

    const { result } = renderHook(() => useHarness(handler), { wrapper });

    expect(result.current.auth.status).toBe('unauthenticated');

    await act(async () => {
      const session = await result.current.auth.authenticate();

      expect(session.address).toBe(address);
      expect(session.wallet).toBe(depositWallet);
      expect(session.credentials).toEqual(credentials);
    });

    expect(result.current.auth.status).toBe('authenticated');
    expect(result.current.client.isSecureClient()).toBe(true);
    expect(handler.kinds).toEqual([
      'requestAddress',
      'requestAddress',
      'signAuthMessage',
    ]);
  });

  it('rejects an explicit EOA wallet before requesting any signature', async () => {
    const handler = createHandler();

    const { result } = renderHook(() => useHarness(handler), { wrapper });

    await act(async () => {
      await expect(
        result.current.auth.authenticate({ wallet: address }),
      ).rejects.toThrow(UnsupportedAccountError);
    });

    expect(result.current.auth.status).toBe('unauthenticated');
    expect(result.current.auth.error).toBeInstanceOf(UnsupportedAccountError);
    expect(handler.kinds).toEqual(['requestAddress']);
  });

  it('settles as cancelled when the handler cancels a step', async () => {
    server.use(
      http.get(`${relayerRoot}/deployed`, () =>
        HttpResponse.json({ deployed: false }),
      ),
    );

    const handler = createHandler();
    const cancelling: WorkflowHandler = async (request, controls) => {
      if (request.kind === 'signAuthMessage') {
        return controls.cancel('User declined');
      }

      return handler(request, controls);
    };

    const { result } = renderHook(() => useHarness(cancelling), { wrapper });

    await act(async () => {
      await expect(result.current.auth.authenticate()).rejects.toThrow(
        CancelledSigningError,
      );
    });

    expect(result.current.auth.status).toBe('unauthenticated');
    expect(result.current.auth.error).toBeInstanceOf(CancelledSigningError);
  });

  it('excludes authenticate from the status-only result', () => {
    const { result } = renderHook(() => useAuthentication(), { wrapper });

    expect('authenticate' in result.current).toBe(false);
    expect(result.current.status).toBe('unauthenticated');
  });

  it('logs out by revoking the session credentials', async () => {
    stubHappyPathEndpoints();
    server.use(
      http.delete(`${clobRoot}/auth/api-key`, () => HttpResponse.json('OK')),
    );

    const handler = createHandler();
    const { result } = renderHook(() => useHarness(handler), { wrapper });

    await act(async () => {
      await result.current.auth.authenticate();
    });
    expect(result.current.auth.status).toBe('authenticated');

    await act(async () => {
      await result.current.auth.logout();
    });

    expect(result.current.auth.status).toBe('unauthenticated');
    expect(result.current.auth.session).toBeUndefined();
    await waitFor(() =>
      expect(result.current.client.isPublicClient()).toBe(true),
    );
  });
});
