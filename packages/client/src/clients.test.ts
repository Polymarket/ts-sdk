import { ApiKeySchema } from '@polymarket/bindings';
import type { ApiKeyCreds } from '@polymarket/bindings/clob';
import { WalletType } from '@polymarket/bindings/gamma';
import {
  type EvmAddress,
  expectEvmAddress,
  expectEvmSignature,
} from '@polymarket/types';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { fetchApiKeys } from './actions/auth';
import { type createPublicClient, createSecureClient } from './clients';
import { forkEnvironmentConfig } from './environments';
import type { ApiKeyAuthorization, Signer } from './types';
import {
  deriveBeaconDepositWalletAddress,
  deriveProxyWalletAddress,
  deriveSafeWalletAddress,
  deriveUupsDepositWalletAddress,
  SignerType,
} from './wallet';

const rpcRoot = 'http://localhost:4014';
const relayerRoot = 'http://localhost:4015';
const clobRoot = 'http://localhost:4016';
const gatewayRoot = 'http://localhost:4017';
const server = setupServer();
const signerAddress = expectEvmAddress(
  '0x0000000000000000000000000000000000000001',
);

const environment = forkEnvironmentConfig({
  name: 'test',
  clob: { rest: clobRoot },
  gateway: { rest: gatewayRoot },
  relayer: { rest: relayerRoot },
  rpc: rpcRoot,
});

const credentials: ApiKeyCreds = {
  key: ApiKeySchema.parse('key'),
  passphrase: 'passphrase',
  secret: 'secret',
};

const apiKey: ApiKeyAuthorization = {
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

const signer: Signer = {
  getAddress() {
    return Promise.resolve(signerAddress);
  },
  signMessage() {
    throw new Error('Unexpected signMessage call');
  },
  signTypedData() {
    throw new Error('Unexpected signTypedData call');
  },
  sendTransaction() {
    throw new Error('Unexpected sendTransaction call');
  },
};

describe('secure client gasless wallet setup', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
  });

  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    server.close();
  });

  it('deploys the default deposit wallet when it is not yet deployed', async () => {
    const expectedWallet = deriveBeaconDepositWalletAddress(
      signerAddress,
      environment.walletDerivation,
    );
    const legacyWallet = deriveUupsDepositWalletAddress(
      signerAddress,
      environment.walletDerivation,
    );
    mockApiKeys();
    mockDepositWalletDeployments([
      { wallet: legacyWallet, deployed: false },
      { wallet: expectedWallet, deployed: false },
    ]);
    const submit = mockDeployDepositWallet();

    const client = await createSecureClient({
      apiKey,
      credentials,
      environment,
      signer,
    });

    expect(submit.called).toBe(true);
    expect(submit.transactionFetches).toBe(2);
    expect(client.account).toEqual({
      signer: signerAddress,
      signerType: SignerType.OWNER,
      wallet: expectedWallet,
      walletType: WalletType.DEPOSIT_WALLET,
    });
  });

  it('defaults createSecureClient without a wallet param to the beacon deposit wallet', async () => {
    const expectedWallet = deriveBeaconDepositWalletAddress(
      signerAddress,
      environment.walletDerivation,
    );
    const legacyWallet = deriveUupsDepositWalletAddress(
      signerAddress,
      environment.walletDerivation,
    );
    mockApiKeys();
    mockDepositWalletDeployments([
      { wallet: legacyWallet, deployed: false },
      { wallet: expectedWallet, deployed: true },
    ]);

    const client = await createSecureClient({
      apiKey,
      credentials,
      environment,
      signer,
    });

    expect(client.account).toEqual({
      signer: signerAddress,
      signerType: SignerType.OWNER,
      wallet: expectedWallet,
      walletType: WalletType.DEPOSIT_WALLET,
    });
  });

  it('defaults createSecureClient without a wallet param to an existing legacy deposit wallet', async () => {
    const expectedWallet = deriveUupsDepositWalletAddress(
      signerAddress,
      environment.walletDerivation,
    );
    mockApiKeys();
    mockDepositWalletDeployments([{ wallet: expectedWallet, deployed: true }]);

    const client = await createSecureClient({
      apiKey,
      credentials,
      environment,
      signer,
    });

    expect(client.account).toEqual({
      signer: signerAddress,
      signerType: SignerType.OWNER,
      wallet: expectedWallet,
      walletType: WalletType.DEPOSIT_WALLET,
    });
  });

  it('verifies an explicit deposit wallet before returning the secure client', async () => {
    const expectedWallet = deriveBeaconDepositWalletAddress(
      signerAddress,
      environment.walletDerivation,
    );
    mockApiKeys();
    const deployedWallet = mockDeployedWallet(expectedWallet);

    const client = await createSecureClient({
      apiKey,
      credentials,
      environment,
      signer,
      wallet: expectedWallet,
    });

    expect(deployedWallet.called).toBe(true);
    expect(client.account).toEqual({
      signer: signerAddress,
      signerType: SignerType.OWNER,
      wallet: expectedWallet,
      walletType: WalletType.DEPOSIT_WALLET,
    });
  });

  it('keeps an explicit EOA wallet bound to the EOA', async () => {
    mockApiKeys();

    const client = await createSecureClient({
      apiKey,
      credentials,
      environment,
      signer,
      wallet: signerAddress,
    });

    expect(client.account).toEqual({
      signer: signerAddress,
      signerType: SignerType.OWNER,
      wallet: signerAddress,
      walletType: WalletType.EOA,
    });
  });

  it('accepts an explicit zero nonce for fresh authentication', async () => {
    let signedTimestamp: number | undefined;
    let loginRequests = 0;
    let directRequests = 0;
    const platformApiKey = 'pk_test_gateway_boundary';
    const signingSigner: Signer = {
      ...signer,
      signTypedData(payload) {
        expect(payload.message.nonce).toBe(0);
        signedTimestamp = Number(payload.message.timestamp);
        return Promise.resolve(expectEvmSignature(`0x${'1'.repeat(130)}`));
      },
    };

    server.use(
      http.post(`${gatewayRoot}/next/login`, async ({ request }) => {
        loginRequests += 1;
        expect(await request.json()).toEqual({
          type: 'L1_CREDENTIALS',
          signer: signerAddress,
          signature: `0x${'1'.repeat(130)}`,
          timestamp: signedTimestamp,
          nonce: 0,
        });
        expect(request.headers.get('POLY_NONCE')).toBeNull();
        expect(request.headers.get('POLY_SIGNATURE')).toBeNull();
        expect(request.headers.get('X-API-Key')).toBe(platformApiKey);
        expect(request.headers.has('authorization')).toBe(false);
        return HttpResponse.json({
          type: 'L2_CREDENTIALS',
          key: credentials.key,
          passphrase: credentials.passphrase,
          secret: credentials.secret,
        });
      }),
      http.get(`${gatewayRoot}/next/me`, ({ request }) => {
        expect(request.headers.get('X-API-Key')).toBe(platformApiKey);
        expect(request.headers.has('POLY_API_KEY')).toBe(false);
        expect(request.headers.has('authorization')).toBe(false);
        return HttpResponse.json({
          keyId: 'test-platform-key',
          keyType: 'publishable',
        });
      }),
      http.get(`${clobRoot}/auth/api-keys`, ({ request }) => {
        directRequests += 1;
        expect(request.headers.get('POLY_API_KEY')).toBe(credentials.key);
        expect(request.headers.has('X-API-Key')).toBe(false);
        expect(request.headers.has('authorization')).toBe(false);
        return HttpResponse.json({ apiKeys: [credentials.key] });
      }),
    );

    const client = await createSecureClient({
      environment,
      platformApiKey,
      nonce: 0,
      signer: signingSigner,
      wallet: signerAddress,
    });

    expect(loginRequests).toBe(1);
    expect(directRequests).toBe(0);
    await expect(client.fetchIdentity()).resolves.toEqual({
      keyId: 'test-platform-key',
      keyType: 'publishable',
    });
    await expect(fetchApiKeys(client)).resolves.toEqual([credentials.key]);
    expect(directRequests).toBe(1);
    expect(client.account).toEqual({
      signer: signerAddress,
      signerType: SignerType.OWNER,
      wallet: signerAddress,
      walletType: WalletType.EOA,
    });
  });

  it.each([
    400,
    401,
    429,
    503,
    'network',
    'invalid-payload',
  ] as const)('does not retry or use direct authentication when gateway login fails: %s', async (failure) => {
    let loginRequests = 0;
    let directRequests = 0;
    server.use(
      http.post(`${gatewayRoot}/next/login`, () => {
        loginRequests += 1;
        if (failure === 'network') return HttpResponse.error();
        if (failure === 'invalid-payload')
          return HttpResponse.json({ type: 'L2_CREDENTIALS', key: 123 });
        return HttpResponse.json(
          { code: 'LOGIN_FAILED', message: 'Login failed' },
          { status: failure },
        );
      }),
      http.all(`${clobRoot}/auth/*`, () => {
        directRequests += 1;
        return HttpResponse.json(
          { error: 'Unexpected direct authentication' },
          { status: 400 },
        );
      }),
    );
    const signTypedData = vi.fn(async () =>
      expectEvmSignature(`0x${'1'.repeat(130)}`),
    );
    await expect(
      createSecureClient({
        environment,
        signer: { ...signer, signTypedData },
        wallet: signerAddress,
      }),
    ).rejects.toMatchObject({
      name:
        failure === 'network'
          ? 'TransportError'
          : failure === 'invalid-payload'
            ? 'UnexpectedResponseError'
            : failure === 429
              ? 'RateLimitError'
              : 'RequestRejectedError',
    });
    expect(signTypedData).toHaveBeenCalledOnce();
    expect(loginRequests).toBe(1);
    expect(directRequests).toBe(0);
  });

  it('reuses valid trading credentials without signing or logging in again', async () => {
    let loginRequests = 0;
    let validationRequests = 0;
    server.use(
      http.post(`${gatewayRoot}/next/login`, () => {
        loginRequests += 1;
        return HttpResponse.json(
          { error: 'Unexpected login' },
          { status: 400 },
        );
      }),
      http.get(`${clobRoot}/auth/api-keys`, ({ request }) => {
        validationRequests += 1;
        expect(request.headers.has('X-API-Key')).toBe(false);
        return HttpResponse.json({ apiKeys: [credentials.key] });
      }),
    );
    const client = await createSecureClient({
      environment,
      credentials,
      platformApiKey: 'pk_test_reused_credentials',
      signer,
      wallet: signerAddress,
    });
    expect(client.account.signer).toBe(signerAddress);
    expect(validationRequests).toBe(1);
    expect(loginRequests).toBe(0);
  });

  it.each([
    -1, 1.5, 4_294_967_296,
  ])('rejects nonce %s before signing or requesting credentials', async (nonce) => {
    const observed = vi.spyOn(globalThis, 'fetch');
    const signTypedData = vi.fn(async () =>
      expectEvmSignature(`0x${'1'.repeat(130)}`),
    );
    await expect(
      createSecureClient({
        environment,
        nonce,
        signer: { ...signer, signTypedData },
        wallet: signerAddress,
      }),
    ).rejects.toMatchObject({ name: 'UserInputError' });
    expect(signTypedData).not.toHaveBeenCalled();
    expect(observed).not.toHaveBeenCalled();
  });

  it('exposes session opening only on the authenticated client type', () => {
    expectTypeOf<ReturnType<typeof createPublicClient>>().not.toHaveProperty(
      'openPredictionsSession',
    );
    expectTypeOf<
      Awaited<ReturnType<typeof createSecureClient>>
    >().toHaveProperty('openPredictionsSession');
    expectTypeOf<ReturnType<typeof createPublicClient>>().toHaveProperty(
      'fetchIdentity',
    );
  });

  it('keeps an explicit deployed Safe wallet bound to the Safe', async () => {
    const safeWallet = deriveSafeWalletAddress(
      signerAddress,
      environment.walletDerivation,
    );
    mockApiKeys();
    mockAccountWalletDeployed(safeWallet, true);

    const client = await createSecureClient({
      apiKey,
      credentials,
      environment,
      signer,
      wallet: safeWallet,
    });

    expect(client.account).toEqual({
      signer: signerAddress,
      signerType: SignerType.OWNER,
      wallet: safeWallet,
      walletType: WalletType.GNOSIS_SAFE,
    });
  });

  it('keeps an explicit deployed proxy wallet bound to the proxy', async () => {
    const proxyWallet = deriveProxyWalletAddress(
      signerAddress,
      environment.walletDerivation,
    );
    mockApiKeys();
    mockAccountWalletDeployed(proxyWallet, true);

    const client = await createSecureClient({
      apiKey,
      credentials,
      environment,
      signer,
      wallet: proxyWallet,
    });

    expect(client.account).toEqual({
      signer: signerAddress,
      signerType: SignerType.OWNER,
      wallet: proxyWallet,
      walletType: WalletType.POLY_PROXY,
    });
  });

  it('rejects an explicit Safe wallet with no deployed code', async () => {
    const safeWallet = deriveSafeWalletAddress(
      signerAddress,
      environment.walletDerivation,
    );
    mockApiKeys();
    mockAccountWalletDeployed(safeWallet, false);

    await expect(
      createSecureClient({
        apiKey,
        credentials,
        environment,
        signer,
        wallet: safeWallet,
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('does not exist'),
      name: 'UserInputError',
    });
  });

  it('rejects an explicit undeployed deposit wallet that is not the current one', async () => {
    const currentWallet = deriveBeaconDepositWalletAddress(
      signerAddress,
      environment.walletDerivation,
    );
    const legacyWallet = deriveUupsDepositWalletAddress(
      signerAddress,
      environment.walletDerivation,
    );
    mockApiKeys();
    mockUndeployedWallet(legacyWallet);

    await expect(
      createSecureClient({
        apiKey,
        credentials,
        environment,
        signer,
        wallet: legacyWallet,
      }),
    ).rejects.toMatchObject({
      message: `Wallet ${legacyWallet} does not match the expected Deposit Wallet ${currentWallet} for this signer, nor a deployed wallet address.`,
      name: 'UserInputError',
    });
  });

  it('does not shut down terminal managers when closing subscriptions', async () => {
    mockApiKeys();
    const client = await createSecureClient({
      apiKey,
      credentials,
      environment,
      signer,
      wallet: signerAddress,
    });
    const perpsShutdown = vi.fn(() => Promise.resolve());
    const rfqShutdown = vi.fn(() => Promise.resolve());
    client.webSockets.perpsSession.shutdown = perpsShutdown;
    client.webSockets.rfqQuoter.shutdown = rfqShutdown;

    await client.closeSubscriptions();

    expect(perpsShutdown).not.toHaveBeenCalled();
    expect(rfqShutdown).not.toHaveBeenCalled();
  });

  it('shuts down terminal managers when ending authentication', async () => {
    mockApiKeys();
    server.use(
      http.delete(`${clobRoot}/auth/api-key`, () => HttpResponse.json('OK')),
    );
    const client = await createSecureClient({
      apiKey,
      credentials,
      environment,
      signer,
      wallet: signerAddress,
    });
    const perpsShutdown = vi.fn(() => Promise.resolve());
    const rfqShutdown = vi.fn(() => Promise.resolve());
    client.webSockets.perpsSession.shutdown = perpsShutdown;
    client.webSockets.rfqQuoter.shutdown = rfqShutdown;

    await client.endAuthentication();

    expect(perpsShutdown).toHaveBeenCalledTimes(1);
    expect(rfqShutdown).toHaveBeenCalledTimes(1);
  });

  it('preserves platform identity when returning to a public client', async () => {
    mockApiKeys();
    const identity = { keyId: 'application-key', keyType: 'publishable' };
    const observedKeys: Array<string | null> = [];
    server.use(
      http.delete(`${clobRoot}/auth/api-key`, () => HttpResponse.json('OK')),
      http.get(`${gatewayRoot}/next/me`, ({ request }) => {
        observedKeys.push(request.headers.get('x-api-key'));
        return HttpResponse.json(identity);
      }),
    );
    const client = await createSecureClient({
      platformApiKey: 'pm_pk_test_application',
      credentials,
      environment,
      signer,
      wallet: signerAddress,
    });
    await expect(client.fetchIdentity()).resolves.toEqual(identity);
    const publicClient = await client.endAuthentication();
    await expect(publicClient.fetchIdentity()).resolves.toEqual(identity);
    expect(observedKeys).toEqual([
      'pm_pk_test_application',
      'pm_pk_test_application',
    ]);
  });
});

function mockApiKeys() {
  server.use(
    http.get(`${clobRoot}/auth/api-keys`, () =>
      HttpResponse.json({ apiKeys: [credentials.key] }),
    ),
  );
}

function mockAccountWalletDeployed(wallet: EvmAddress, deployed: boolean) {
  server.use(
    http.get(`${relayerRoot}/deployed`, ({ request }) => {
      const url = new URL(request.url);

      expect(url.searchParams.get('address')).toBe(wallet);

      return HttpResponse.json({ deployed });
    }),
  );
}

function mockUndeployedWallet(expectedWallet: EvmAddress) {
  server.use(
    http.get(`${relayerRoot}/deployed`, ({ request }) => {
      const url = new URL(request.url);

      expect(url.searchParams.get('address')).toBe(expectedWallet);
      expect(url.searchParams.get('type')).toBe('WALLET');

      return HttpResponse.json({ deployed: false });
    }),
  );
}

function mockDepositWalletDeployments(
  deployments: Array<{ wallet: EvmAddress; deployed: boolean }>,
) {
  server.use(
    http.get(`${relayerRoot}/deployed`, ({ request }) => {
      const url = new URL(request.url);
      const address = expectEvmAddress(url.searchParams.get('address') ?? '');
      const deployment = deployments.find(
        ({ wallet }) => wallet.toLowerCase() === address.toLowerCase(),
      );

      expect(url.searchParams.get('type')).toBe('WALLET');
      expect(deployment).toBeDefined();

      return HttpResponse.json({ deployed: deployment?.deployed ?? false });
    }),
  );
}

function mockDeployDepositWallet() {
  const state = { called: false, transactionFetches: 0 };
  const transactionId = '00000000-0000-0000-0000-000000000001';
  const transactionHash = `0x${'1'.repeat(64)}`;

  server.use(
    http.post(`${relayerRoot}/submit`, () => {
      state.called = true;

      return HttpResponse.json({
        state: 'STATE_MINED',
        transactionHash,
        transactionID: transactionId,
      });
    }),
    http.get(`${relayerRoot}/v1/account/transactions/${transactionId}`, () => {
      state.transactionFetches += 1;

      return HttpResponse.json({
        state:
          state.transactionFetches === 1 ? 'STATE_MINED' : 'STATE_CONFIRMED',
        transaction_hash: transactionHash,
        transaction_id: transactionId,
      });
    }),
  );

  return state;
}

function mockDeployedWallet(expectedWallet: EvmAddress) {
  const state = { called: false };

  server.use(
    http.get(`${relayerRoot}/deployed`, ({ request }) => {
      state.called = true;
      const url = new URL(request.url);

      expect(url.searchParams.get('address')).toBe(expectedWallet);
      expect(url.searchParams.get('type')).toBe('WALLET');

      return HttpResponse.json({ deployed: true });
    }),
  );

  return state;
}
