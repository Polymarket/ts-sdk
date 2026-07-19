import type { ApiKeyCreds } from '@polymarket/client';
import {
  forkEnvironmentConfig,
  InsufficientAllowanceError,
} from '@polymarket/client';
import { expectEvmAddress } from '@polymarket/types';
import { act, renderHook } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
// Test-only deep import: derive a valid Deposit Wallet fixture without a network.
import { deriveBeaconDepositWalletAddress } from '../../../client/src/wallet';
import { createConfig } from '../config';
import { PolymarketProvider } from '../context';
import type { Session } from '../session';
import { useCancelOrder } from './trading';

const clobRoot = 'http://localhost:4316';
const server = setupServer();

const environment = forkEnvironmentConfig({
  name: 'test',
  clob: { rest: clobRoot },
});

const config = createConfig({ environment });
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

describe('useCancelOrder', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('cancels an order through the session client', async () => {
    server.use(
      http.delete(`${clobRoot}/order`, () =>
        HttpResponse.json({ canceled: ['order-1'], not_canceled: {} }),
      ),
    );

    const { result } = renderHook(() => useCancelOrder(), { wrapper });

    await act(async () => {
      const response = await result.current[0]({ orderId: 'order-1' });

      expect(response.canceled).toEqual(['order-1']);
    });

    expect(result.current[1].status).toBe('success');
    expect(result.current[1].data?.canceled).toEqual(['order-1']);
  });

  it('surfaces cancellation failures on error state', async () => {
    server.use(
      http.delete(`${clobRoot}/order`, () =>
        HttpResponse.json({ error: 'order not found' }, { status: 400 }),
      ),
    );

    const { result } = renderHook(() => useCancelOrder(), { wrapper });

    await act(async () => {
      await expect(result.current[0]({ orderId: 'missing' })).rejects.toThrow(
        'order not found',
      );
    });

    expect(result.current[1].status).toBe('error');
  });
});

describe('InsufficientAllowanceError re-export sanity', () => {
  it('is importable from the client for integrator branching', () => {
    const error = new InsufficientAllowanceError('allowance is not enough', {
      status: 400,
    });

    expect(error.name).toBe('InsufficientAllowanceError');
  });
});
