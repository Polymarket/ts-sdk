import type { ApiKeyAuthorization, ApiKeyCreds } from '@polymarket/client';
import { forkEnvironmentConfig } from '@polymarket/client';
import { expectEvmAddress } from '@polymarket/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
// Test-only deep import: derive a valid Deposit Wallet fixture without a network.
import { deriveBeaconDepositWalletAddress } from '../../../client/src/wallet';
import { createConfig } from '../config';
import { PolymarketProvider } from '../context';
import type { Session } from '../session';
import { useDeployWallet, useIsWalletDeployed } from './wallet';

const relayerRoot = 'http://localhost:4516';
const server = setupServer();

const environment = forkEnvironmentConfig({
  name: 'test',
  relayer: { rest: relayerRoot },
});

const gaslessApiKey: ApiKeyAuthorization = {
  get isBuilderKey() {
    return false;
  },
  get supportGasless() {
    return true;
  },
  authorize() {
    return Promise.resolve({ RELAYER_API_KEY: 'key' });
  },
};

const config = createConfig({ environment, apiKey: gaslessApiKey });
const address = expectEvmAddress(`0x${'1'.repeat(40)}`);

const session: Session = {
  address,
  wallet: deriveBeaconDepositWalletAddress(
    address,
    environment.walletDerivation,
  ),
  credentials: {
    key: 'key' as ApiKeyCreds['key'],
    passphrase: 'passphrase',
    secret: 'secret',
  },
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <PolymarketProvider config={config} initialSession={session}>
      {children}
    </PolymarketProvider>
  );
}

describe('wallet deployment hooks', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('reads the session wallet deployment status', async () => {
    const seen: string[] = [];

    server.use(
      http.get(`${relayerRoot}/deployed`, ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('address') ?? '');
        return HttpResponse.json({ deployed: false });
      }),
    );

    const { result } = renderHook(() => useIsWalletDeployed(), { wrapper });

    await waitFor(() => expect(result.current.data).toBe(false));
    expect(seen).toEqual([session.wallet]);
  });

  it('deploys the wallet and resolves at confirmation', async () => {
    const transactionId = '00000000-0000-0000-0000-000000000001';
    const transactionHash = `0x${'2'.repeat(64)}`;
    let polls = 0;

    server.use(
      http.post(`${relayerRoot}/submit`, () =>
        HttpResponse.json({
          state: 'STATE_MINED',
          transactionHash,
          transactionID: transactionId,
        }),
      ),
      http.get(
        `${relayerRoot}/v1/account/transactions/${transactionId}`,
        () => {
          polls += 1;
          return HttpResponse.json({
            state: polls === 1 ? 'STATE_MINED' : 'STATE_CONFIRMED',
            transaction_hash: transactionHash,
            transaction_id: transactionId,
          });
        },
      ),
    );

    const { result } = renderHook(() => useDeployWallet(), { wrapper });

    await act(async () => {
      const outcome = await result.current[0]();

      expect(outcome.transactionHash).toBe(transactionHash);
    });

    expect(result.current[1].status).toBe('success');
    expect(result.current[1].data?.transactionHash).toBe(transactionHash);
    expect(polls).toBeGreaterThan(1);
  });
});
