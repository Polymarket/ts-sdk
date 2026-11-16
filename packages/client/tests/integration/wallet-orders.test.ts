import { OrderSide } from '@polymarket/bindings';
import { RelayerRevokeSessionSignerResponseSchema } from '@polymarket/bindings/relayer';
import {
  createSecureClient,
  type EnvironmentConfig,
  type Market,
  OrderPostStatus,
  type Paginated,
  RequestRejectedError,
  type SecureClient,
  SessionKeyKnownScope,
  UserInputError,
  type WalletOpenOrder,
} from '@polymarket/client';
import { GaslessTransactionHandle } from '@polymarket/client/actions';
import { privateKey } from '@polymarket/client/viem';
import type { EvmAddress } from '@polymarket/types';
import { delay, expectPresent } from '@polymarket/types';
import { http } from 'viem';
import { generatePrivateKey } from 'viem/accounts';
import { vi } from 'vitest';
import { describe, expect, it, runMeteredTests } from './fixtures';
import { expectAcceptedOrderResponse } from './helpers';
import { findHighVolumeLowPriceMarket } from './markets';

describe('Wallet-wide orders', { timeout: 600_000 }, () => {
  it('reads the authenticated wallet without builder credentials', async ({
    secureClientWithDepositWallet,
  }) => {
    const firstPage = await secureClientWithDepositWallet
      .listWalletOpenOrders()
      .firstPage();
    expect(Array.isArray(firstPage.items)).toBe(true);
    expect(firstPage.hasMore).toBe(firstPage.nextCursor !== undefined);
    for (const order of firstPage.items) {
      expect(order.makerAddress.toLowerCase()).toBe(
        secureClientWithDepositWallet.account.wallet.toLowerCase(),
      );
      expect(order.signerAddress).toMatch(/^0x[0-9a-f]{40}$/i);
    }
  });

  // Live side effects: authorizes and revokes an on-chain session-key grant,
  // places two minimum-size post-only orders, and cancels every resting order
  // on the shared integration Deposit Wallet.
  describe.runIf(runMeteredTests)('session-key workflow', () => {
    it('authorizes with a relayer API key, then reads and cancels wallet orders', async ({
      annotate,
      depositWalletAddress,
      depositWalletSigner,
      environment,
      onTestFinished,
      publicClient,
      relayerAuthentication,
    }) => {
      const market = await findHighVolumeLowPriceMarket(publicClient, {
        sportsOnly: false,
      });
      const assetId = expectPresent(market.outcomes.yes.tokenId);
      const owner = await createSecureClient({
        apiKey: relayerAuthentication,
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });
      const ownerAddress = owner.account.signer;
      const sessionSigner = privateKey(generatePrivateKey(), {
        transport: http(environment.rpc),
      });
      const sessionAddress = await sessionSigner.getAddress();
      let ordersMayRemain = false;
      let revoked = false;

      // Register before authorization: it can create the grant before failing.
      onTestFinished(async () => {
        const cleanupErrors: unknown[] = [];
        if (ordersMayRemain) {
          try {
            await owner.cancelAllWalletOrders();
          } catch (error) {
            cleanupErrors.push(error);
          }
        }
        if (!revoked) {
          try {
            await revokeSessionKeyAndWait(owner, sessionAddress, environment);
          } catch (error) {
            cleanupErrors.push(error);
          }
        }
        if (cleanupErrors.length > 0) {
          throw new AggregateError(
            cleanupErrors,
            'Wallet-order cleanup failed.',
          );
        }
      }, 600_000);

      await annotate(`Market ID: ${market.id}`);
      await annotate(`Session address: ${sessionAddress}`);

      const authorization = await owner.authorizeSessionKey({
        address: sessionAddress,
        scopes: [SessionKeyKnownScope.CLOB],
      });
      expect(authorization.sessionKey.address).toBe(
        sessionAddress.toLowerCase(),
      );
      expect(await owner.fetchSessionKeys()).toContainEqual(
        authorization.sessionKey,
      );

      const session = await createSecureClient({
        environment,
        signer: sessionSigner,
        wallet: owner.account.wallet,
      });

      ordersMayRemain = true;
      const sessionOrderId = await placeSessionOrderWhenReady(
        session,
        market,
        annotate,
      );
      const ownerOrderId = await placeRestingOrder(owner, market);

      // Read: signer filters select by placing signer, and session signers can
      // read the whole wallet.
      await vi.waitFor(
        async () => {
          const visible = await collect(
            session.listWalletOpenOrders({ assetId }),
          );
          expect(visible.map((order) => order.id)).toEqual(
            expect.arrayContaining([sessionOrderId, ownerOrderId]),
          );
        },
        { timeout: 20_000, interval: 1_000 },
      );

      const sessionOrders = await collect(
        owner.listWalletOpenOrders({
          assetId,
          signerAddresses: [sessionAddress],
        }),
      );
      const sessionOrder = sessionOrders.find(
        (order) => order.id === sessionOrderId,
      );
      expect(sessionOrder).toMatchObject({
        assetId,
        conditionId: market.conditionId,
      });
      expect(sessionOrder?.makerAddress.toLowerCase()).toBe(
        owner.account.wallet.toLowerCase(),
      );
      expect(
        sessionOrders.every(
          (order) =>
            order.signerAddress.toLowerCase() === sessionAddress.toLowerCase(),
        ),
      ).toBe(true);

      const ownerOrders = await collect(
        owner.listWalletOpenOrders({
          assetId,
          signerAddresses: [ownerAddress],
        }),
      );
      expect(ownerOrders.map((order) => order.id)).toContain(ownerOrderId);
      expect(
        ownerOrders.every(
          (order) =>
            order.signerAddress.toLowerCase() === ownerAddress.toLowerCase(),
        ),
      ).toBe(true);

      // Several signers in one filter exercise the multi-address wire format.
      const bothSigners = await collect(
        owner.listWalletOpenOrders({
          assetId,
          signerAddresses: [sessionAddress, ownerAddress],
        }),
      );
      expect(bothSigners.map((order) => order.id)).toEqual(
        expect.arrayContaining([sessionOrderId, ownerOrderId]),
      );

      // Credential-scoped listing excludes the session signer's order.
      const { items: credentialScoped } = await owner
        .listOpenOrders({ assetId, market: expectPresent(market.conditionId) })
        .firstPage();
      expect(
        credentialScoped.some((order) => order.id === sessionOrderId),
      ).toBe(false);

      // Cancel: only the owner cancels across the wallet.
      await expect(
        session.cancelWalletOrders({ orderIds: [sessionOrderId] }),
      ).rejects.toBeInstanceOf(UserInputError);
      await expect(session.cancelAllWalletOrders()).rejects.toBeInstanceOf(
        UserInputError,
      );

      const selected = await owner.cancelWalletOrders({
        orderIds: [sessionOrderId],
      });
      expect(selected.canceled).toContain(sessionOrderId);

      const all = await owner.cancelAllWalletOrders();
      expect(all.canceled).toContain(ownerOrderId);
      ordersMayRemain = false;

      const remaining = await collect(owner.listWalletOpenOrders({ assetId }));
      expect(
        remaining.some(
          (order) => order.id === sessionOrderId || order.id === ownerOrderId,
        ),
      ).toBe(false);

      await revokeSessionKeyAndWait(owner, sessionAddress, environment);
      revoked = true;
      expect(
        (await owner.fetchSessionKeys()).some(
          (key) => key.address === sessionAddress.toLowerCase(),
        ),
      ).toBe(false);
    });
  });
});

async function collect(
  paginated: Paginated<WalletOpenOrder[]>,
): Promise<WalletOpenOrder[]> {
  const items: WalletOpenOrder[] = [];
  for await (const page of paginated) items.push(...page.items);
  return items;
}

async function placeRestingOrder(
  client: SecureClient,
  market: Market,
): Promise<string> {
  const response = await client.placeLimitOrder({
    assetId: expectPresent(market.outcomes.yes.tokenId),
    postOnly: true,
    price: expectPresent(market.trading.minimumTickSize),
    side: OrderSide.BUY,
    size: expectPresent(market.trading.minimumOrderSize),
  });
  const accepted = expectAcceptedOrderResponse(response);
  expect(accepted.status).toBe(OrderPostStatus.LIVE);
  return accepted.orderId;
}

async function placeSessionOrderWhenReady(
  session: SecureClient,
  market: Market,
  annotate: (message: string) => Promise<unknown>,
): Promise<string> {
  // Different registry instances may retain the previous signer set for 65s.
  const deadline = Date.now() + 75_000;
  for (let retries = 1; ; retries += 1) {
    try {
      return await placeRestingOrder(session, market);
    } catch (error) {
      if (
        !(error instanceof RequestRejectedError) ||
        error.status !== 400 ||
        !error.message.startsWith(
          'the order signer address has to be the address of the API KEY',
        ) ||
        Date.now() + 2_000 > deadline
      ) {
        throw error;
      }
      await annotate(`Session-key order readiness retry: ${retries}`);
      await delay(2_000);
    }
  }
}

async function revokeSessionKeyAndWait(
  owner: SecureClient,
  sessionAddress: EvmAddress,
  environment: EnvironmentConfig,
): Promise<void> {
  const revocationUrl = new URL(
    '/v1/session-signers/revocations',
    environment.relayer.rest,
  );
  const originalFetch = globalThis.fetch;
  let transaction: GaslessTransactionHandle | undefined;
  const sending = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const response = await originalFetch(input, init);
      const url = new URL(input instanceof Request ? input.url : input);
      const method =
        init?.method ?? (input instanceof Request ? input.method : 'GET');
      if (
        response.ok &&
        method === 'POST' &&
        url.origin === revocationUrl.origin &&
        url.pathname === revocationUrl.pathname
      ) {
        const revocation = RelayerRevokeSessionSignerResponseSchema.parse(
          await response.clone().json(),
        );
        transaction = new GaslessTransactionHandle(owner, {
          transactionHash: null,
          transactionId: revocation.transactionId,
        });
      }
      return response;
    });
  try {
    await owner.revokeSessionKey({ address: sessionAddress });
  } finally {
    sending.mockRestore();
    // Registry removal returns before the relayer releases this shared wallet,
    // so the next authorization must wait for the revocation transaction.
    await transaction?.wait();
  }
}
