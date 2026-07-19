import type { ApiKeyCreds } from '@polymarket/client';
import { forkEnvironmentConfig } from '@polymarket/client';
import { expectEvmAddress } from '@polymarket/types';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
// Test-only deep import: derive a valid Deposit Wallet fixture without a network.
import { deriveBeaconDepositWalletAddress } from '../../../client/src/wallet';
import { createConfig } from '../config';
import { PolymarketProvider } from '../context';
import type { Session } from '../session';
import { usePortfolioValue, usePositions } from './portfolio';

const dataRoot = 'http://localhost:4416';
const server = setupServer();

const environment = forkEnvironmentConfig({
  name: 'test',
  data: { rest: dataRoot },
});

const config = createConfig({ environment });
const address = expectEvmAddress(`0x${'1'.repeat(40)}`);
const otherUser = `0x${'2'.repeat(40)}`;

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

function createWrapper(initialSession?: Session) {
  return function wrapper({ children }: { children: ReactNode }) {
    return (
      <PolymarketProvider config={config} initialSession={initialSession}>
        {children}
      </PolymarketProvider>
    );
  };
}

function capturePositionUsers(seen: string[]) {
  return http.get(`${dataRoot}/positions`, ({ request }) => {
    seen.push(new URL(request.url).searchParams.get('user') ?? '');
    return HttpResponse.json([]);
  });
}

describe('session-defaulted portfolio reads', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('pauses without a user while unauthenticated', () => {
    const { result } = renderHook(() => usePositions(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPaused).toBe(true);
  });

  it('defaults the user to the session wallet', async () => {
    const seen: string[] = [];
    server.use(capturePositionUsers(seen));

    const { result } = renderHook(() => usePositions(), {
      wrapper: createWrapper(session),
    });

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(seen).toEqual([session.wallet.toLowerCase()]);
  });

  it('reads an explicit user without a session', async () => {
    const seen: string[] = [];
    server.use(capturePositionUsers(seen));

    const { result } = renderHook(() => usePositions({ user: otherUser }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(seen).toEqual([otherUser]);
  });

  it('prefers an explicit user over the session wallet', async () => {
    const seen: string[] = [];
    server.use(capturePositionUsers(seen));

    const { result } = renderHook(() => usePositions({ user: otherUser }), {
      wrapper: createWrapper(session),
    });

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(seen).toEqual([otherUser]);
  });

  it('defaults one-shot reads the same way', async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${dataRoot}/value`, ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('user') ?? '');
        return HttpResponse.json([{ user: session.wallet, value: 123.45 }]);
      }),
    );

    const { result } = renderHook(() => usePortfolioValue(), {
      wrapper: createWrapper(session),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(seen).toEqual([session.wallet.toLowerCase()]);
    // Decimalish values normalize to branded decimal strings.
    expect(result.current.data?.[0]?.value).toBe('123.45');
  });
});
