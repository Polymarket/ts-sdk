import { type EvmAddress, expectEvmAddress } from '@polymarket/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSecureClient, type SecureClient } from '../clients';
import { forkEnvironmentConfig } from '../environments';
import { RequestAbortedError, UnexpectedResponseError } from '../errors';
import type { Signer } from '../types';
import {
  deriveBeaconDepositWalletAddress,
  deriveProxyWalletAddress,
} from '../wallet';

// The secure client methods run against a fetch that answers like the API
// Gateway, because no test account holds a Safe or Proxy wallet.
const root = 'https://synthetic.invalid';
const environment = forkEnvironmentConfig({
  name: 'controlled-wallet-migration',
  predictions: { rest: `${root}/` },
  relayerPollFrequencyMs: 60_000,
});
const signerAddress = expectEvmAddress(
  '0x0000000000000000000000000000000000000001',
);
const proxyWallet = deriveProxyWalletAddress(
  signerAddress,
  environment.walletDerivation,
);
const depositWallet = deriveBeaconDepositWalletAddress(
  signerAddress,
  environment.walletDerivation,
);

function accessToken(
  sequence: number,
  wallet: EvmAddress | undefined,
  signatureType: number,
): string {
  const claims = {
    sub: signerAddress,
    client_id: 'synthetic-client',
    ...(wallet === undefined ? {} : { wallet, signature_type: signatureType }),
    exp: Math.floor(Date.now() / 1000) + 900,
    jti: sequence,
  };
  return `test.${btoa(JSON.stringify(claims))}.test`;
}

function signer(): Signer {
  return {
    getAddress: vi.fn(async () => signerAddress),
    signTypedData: vi.fn(),
    signMessage: vi.fn(),
    sendTransaction: vi.fn(),
  };
}

type Route = (request: Request) => Promise<Response> | Response;

/** Creates a client on a saved session and answers each request from `routes`. */
async function migrationClient(
  wallet: EvmAddress | undefined,
  routes: Record<string, Route>,
): Promise<{ client: SecureClient; paths: string[] }> {
  const credentials = {
    accessToken: accessToken(0, wallet, wallet === proxyWallet ? 1 : 3),
    refreshToken: 'synthetic-refresh',
  };
  const paths: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    paths.push(path);
    if (path === '/v1/auth/refresh')
      return Response.json({
        ...credentials,
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshExpiresIn: 3600,
      });
    const route = routes[path];
    if (route === undefined) throw new Error(`Unexpected route: ${path}`);
    return route(request);
  });
  const client = await createSecureClient({
    environment,
    fetch,
    signer: signer(),
    credentials,
    walletSetup: false,
  });
  paths.length = 0;
  return { client, paths };
}

async function close(client: SecureClient): Promise<void> {
  client.closeAuthenticationSession();
  await client.closeSubscriptions();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('wallet migration methods', () => {
  it('binds the Deposit Wallet after the migration completes', async () => {
    const bound = accessToken(1, depositWallet, 3);
    async function bind(request: Request): Promise<Response> {
      expect(await request.json()).toEqual({ wallet: depositWallet });
      return Response.json({
        accessToken: bound,
        tokenType: 'Bearer',
        expiresIn: 900,
      });
    }
    // A session without a wallet, so the bind is a first bind. The bind path
    // moves from /v1/auth/upgrade to /v1/auth/bind with the session bind change.
    const { client, paths } = await migrationClient(undefined, {
      '/v1/wallets/migration/start': () =>
        Response.json({
          state: 'COMPLETED',
          depositWallet,
          nextAction: { type: 'none' },
        }),
      '/v1/auth/upgrade': bind,
      '/v1/auth/bind': bind,
    });
    try {
      await expect(client.migrateWallet()).resolves.toEqual({
        depositWallet,
        credentials: { accessToken: bound, refreshToken: 'synthetic-refresh' },
      });
      expect(paths).toHaveLength(2);
      expect(paths[0]).toBe('/v1/wallets/migration/start');
      expect(paths[1]).toMatch(/^\/v1\/auth\/(upgrade|bind)$/);
      expect(client.account.wallet).toBe(depositWallet);
    } finally {
      await close(client);
    }
  });

  it('returns the current wallet and credentials without a bind when no migration is required', async () => {
    const { client, paths } = await migrationClient(depositWallet, {
      '/v1/wallets/migration/start': () =>
        Response.json({ state: 'NOT_REQUIRED', nextAction: { type: 'none' } }),
    });
    try {
      const credentials = client.credentials;
      await expect(client.migrateWallet()).resolves.toEqual({
        depositWallet,
        credentials,
      });
      expect(paths).toEqual(['/v1/wallets/migration/start']);
    } finally {
      await close(client);
    }
  });

  it('rejects a finished migration that names no Deposit Wallet of the signer and binds nothing', async () => {
    const { client, paths } = await migrationClient(proxyWallet, {
      '/v1/wallets/migration/start': () =>
        Response.json({
          state: 'COMPLETED',
          depositWallet: '0x00000000000000000000000000000000000000d1',
          nextAction: { type: 'none' },
        }),
    });
    try {
      await expect(client.migrateWallet()).rejects.toBeInstanceOf(
        UnexpectedResponseError,
      );
      expect(paths).toEqual(['/v1/wallets/migration/start']);
      expect(client.account.wallet).toBe(proxyWallet);
    } finally {
      await close(client);
    }
  });

  it('stops waiting before a poll when the caller aborts', async () => {
    const controller = new AbortController();
    const { client, paths } = await migrationClient(proxyWallet, {
      '/v1/wallets/migration/start': () => {
        // The flow then waits a minute before its first poll.
        setTimeout(() => controller.abort(), 0);
        return Response.json({
          state: 'REQUIRES_FUNDS_TRANSFERS',
          depositWallet,
          nextAction: { type: 'execute' },
          sweepSubmitted: true,
        });
      },
    });
    try {
      await expect(
        client.migrateWallet({ signal: controller.signal }),
      ).rejects.toBeInstanceOf(RequestAbortedError);
      expect(paths).toEqual(['/v1/wallets/migration/start']);
    } finally {
      await close(client);
    }
  });

  it('cancels the migration and returns its state', async () => {
    const { client, paths } = await migrationClient(proxyWallet, {
      '/v1/wallets/migration/cancel': () =>
        Response.json({
          state: 'NOT_REQUIRED',
          tradingPaused: false,
          cancelable: false,
          manifest: [],
          nextAction: { type: 'none' },
        }),
    });
    try {
      await expect(client.cancelWalletMigration()).resolves.toMatchObject({
        state: 'NOT_REQUIRED',
        tradingPaused: false,
      });
      expect(paths).toEqual(['/v1/wallets/migration/cancel']);
    } finally {
      await close(client);
    }
  });

  it('reads the leftovers again after a sweep', async () => {
    const leftovers = {
      hasLeftovers: false,
      legacyWallet: proxyWallet,
      depositWallet,
      manifest: [],
      cashUsd: 0,
      amountUsd: 0,
      amountComplete: true,
      blockers: [],
      lastSweep: { state: 'COMPLETED', sweepSubmitted: true },
      sweepAvailable: false,
    };
    const { client, paths } = await migrationClient(depositWallet, {
      '/v1/wallets/migration/sweep/start': () =>
        Response.json({ state: 'COMPLETED', nextAction: { type: 'none' } }),
      '/v1/wallets/migration/leftovers': () => Response.json(leftovers),
    });
    try {
      await expect(client.sweepWalletLeftovers()).resolves.toMatchObject({
        hasLeftovers: false,
        lastSweep: { state: 'COMPLETED' },
      });
      expect(paths).toEqual([
        '/v1/wallets/migration/sweep/start',
        '/v1/wallets/migration/leftovers',
      ]);
    } finally {
      await close(client);
    }
  });
});
