import { OrderSide } from '@polymarket/bindings';
import { RelayerRevokeSessionSignerResponseSchema } from '@polymarket/bindings/relayer';
import {
  createSecureClient,
  OrderPostStatus,
  RequestRejectedError,
  SessionKeyKnownScope,
  SignerType,
  TransferPerpsCollateralError,
  UserInputError,
} from '@polymarket/client';
import { GaslessTransactionHandle } from '@polymarket/client/actions';
import { privateKey } from '@polymarket/client/viem';
import { delay, expectPresent } from '@polymarket/types';
import { http } from 'viem';
import { generatePrivateKey } from 'viem/accounts';
import { vi } from 'vitest';
import { describe, expect, it } from './fixtures';
import { expectAcceptedOrderResponse } from './helpers';
import { findHighVolumeLowPriceMarket } from './markets';

const SESSION_KEY_LIFETIME_SECONDS = 4_315 * 60 * 60;

describe('Session keys', { timeout: 600_000 }, () => {
  it('requires builder authentication before authorizing a session key', async ({
    secureClientWithDepositWallet,
  }) => {
    const sessionAddress = await privateKey(generatePrivateKey()).getAddress();

    expect(secureClientWithDepositWallet.hasBuilderApiKey).toBe(false);
    await expect(
      secureClientWithDepositWallet.authorizeSessionKey({
        address: sessionAddress,
      }),
    ).rejects.toThrow(
      'Session-key authorization requires builder API-key authentication.',
    );
  });

  it('requires gasless authentication before revoking a session key', async ({
    depositWalletAddress,
    depositWalletSigner,
    environment,
  }) => {
    const client = await createSecureClient({
      environment,
      signer: depositWalletSigner,
      wallet: depositWalletAddress,
    });
    const sessionAddress = await privateKey(generatePrivateKey()).getAddress();

    expect(client.supportsGasless).toBe(false);
    await expect(
      client.revokeSessionKey({ address: sessionAddress }),
    ).rejects.toThrow(
      'Session-key revocation requires API-key authentication that supports gasless transactions.',
    );
  });

  it('authorizes, lists, uses, and revokes a default-scoped session key', async ({
    annotate,
    builderAuthentication,
    depositWalletAddress,
    depositWalletSigner,
    environment,
    onTestFinished,
    publicClient,
  }) => {
    const market = await findHighVolumeLowPriceMarket(publicClient, {
      sportsOnly: false,
    });
    const secureClientWithDepositWallet = await createSecureClient({
      apiKey: builderAuthentication,
      environment,
      signer: depositWalletSigner,
      wallet: depositWalletAddress,
    });
    const sessionSigner = privateKey(generatePrivateKey(), {
      transport: http(environment.rpc),
    });
    const sessionAddress = await sessionSigner.getAddress();

    // Register before authorization: it can create the grant before failing.
    onTestFinished(async () => {
      const originalFetch = globalThis.fetch;
      const revocationUrl = new URL(
        '/v1/session-signers/revocations',
        environment.relayer.rest,
      );
      let revocationTransaction: GaslessTransactionHandle | undefined;
      const cleanupErrors: unknown[] = [];
      const sending = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input, init) => {
          const response = await originalFetch(input, init);
          const requestUrl = new URL(
            input instanceof Request ? input.url : input,
          );
          const method =
            init?.method ?? (input instanceof Request ? input.method : 'GET');
          if (
            response.ok &&
            method === 'POST' &&
            requestUrl.origin === revocationUrl.origin &&
            requestUrl.pathname === revocationUrl.pathname
          ) {
            const revocation = RelayerRevokeSessionSignerResponseSchema.parse(
              await response.clone().json(),
            );
            revocationTransaction = new GaslessTransactionHandle(
              secureClientWithDepositWallet,
              {
                transactionHash: null,
                transactionId: revocation.transactionId,
              },
            );
          }
          return response;
        });

      try {
        await secureClientWithDepositWallet.revokeSessionKey({
          address: sessionAddress,
        });
      } catch (error) {
        cleanupErrors.push(error);
      } finally {
        sending.mockRestore();
      }

      // Registry removal returns before the relayer releases this shared wallet.
      // Wait for the captured submission even if subsequent registry polling failed.
      if (revocationTransaction !== undefined) {
        try {
          await annotate(
            `Revocation transaction: ${revocationTransaction.transactionId}`,
          );
          await revocationTransaction.wait();
        } catch (error) {
          cleanupErrors.push(error);
        }
      } else if (cleanupErrors.length === 0) {
        cleanupErrors.push(
          new Error('Revocation transaction was not observed.'),
        );
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, 'Session-key cleanup failed.');
      }

      const remainingSessionKeys =
        await secureClientWithDepositWallet.fetchSessionKeys();
      expect(
        remainingSessionKeys.some(
          (sessionKey) =>
            sessionKey.address.toLowerCase() === sessionAddress.toLowerCase(),
        ),
      ).toBe(false);
    }, 600_000);

    const earliestExpiry =
      Math.floor(Date.now() / 1_000) + SESSION_KEY_LIFETIME_SECONDS;
    const authorization =
      await secureClientWithDepositWallet.authorizeSessionKey({
        address: sessionAddress,
      });
    const latestExpiry =
      Math.floor(Date.now() / 1_000) + SESSION_KEY_LIFETIME_SECONDS;

    annotate(`Session address: ${sessionAddress}`);
    annotate(
      `Authorization transaction: ${authorization.transaction.transactionHash}`,
    );
    expect(authorization.transaction.transactionHash).toMatch(
      /^0x[0-9a-f]{64}$/i,
    );
    expect(authorization.transaction.transactionId).not.toBeNull();
    const { validUntil } = authorization.sessionKey;
    expect(validUntil).toBeGreaterThanOrEqual(earliestExpiry);
    expect(validUntil).toBeLessThanOrEqual(latestExpiry);
    expect(authorization.sessionKey).toEqual({
      address: sessionAddress.toLowerCase(),
      scopes: [SessionKeyKnownScope.ALL],
      validUntil,
    });

    const activeSessionKeys =
      await secureClientWithDepositWallet.fetchSessionKeys();
    expect(activeSessionKeys).toContainEqual(authorization.sessionKey);

    const sessionClient = await createSecureClient({
      environment,
      signer: sessionSigner,
      wallet: secureClientWithDepositWallet.account.wallet,
    });
    expect(sessionClient.account.signerType).toBe(SignerType.SESSION_KEY);
    await expect(
      sessionClient.requestComboQuote({
        amount: 1,
        direction: OrderSide.BUY,
        legPositionIds: ['1', '2'],
      }),
    ).rejects.toThrow('Combos is not supported with Session Keys');

    const tokenId = expectPresent(market.outcomes.yes.tokenId);
    let orderId: string | undefined;

    // Finished hooks run in reverse order, canceling before revoking the key.
    onTestFinished(async () => {
      if (orderId !== undefined) {
        const cancellation = await sessionClient.cancelOrder({ orderId });
        expect(cancellation.canceled).toContain(orderId);
      }
    }, 60_000);

    annotate(`Market ID: ${market.id}`);
    annotate(`Token ID: ${tokenId}`);

    const signing = vi.spyOn(sessionClient.signer, 'signTypedData');
    const sending = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(
        sessionClient.transferPerpsCollateral({
          // Stay non-transferable even if the owner check regresses.
          amount: '0',
          recipient: secureClientWithDepositWallet.account.signer,
        }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof UserInputError &&
          TransferPerpsCollateralError.isError(error) &&
          error.message ===
            'Perps collateral transfers must be signed by the account owner.',
      );
      expect(signing).not.toHaveBeenCalled();
      expect(sending).not.toHaveBeenCalled();
    } finally {
      signing.mockRestore();
      sending.mockRestore();
    }

    // Different registry instances may retain the previous signer set for 65s.
    const readinessDeadline = Date.now() + 75_000;
    let readinessRetries = 0;
    for (;;) {
      try {
        const response = await sessionClient.placeLimitOrder({
          postOnly: true,
          price: expectPresent(market.trading.minimumTickSize),
          side: OrderSide.BUY,
          size: expectPresent(market.trading.minimumOrderSize),
          tokenId,
        });
        const accepted = expectAcceptedOrderResponse(response);
        orderId = accepted.orderId;

        expect(accepted.status).toBe(OrderPostStatus.LIVE);
        break;
      } catch (error) {
        if (
          !(error instanceof RequestRejectedError) ||
          error.status !== 400 ||
          !error.message.startsWith(
            'the order signer address has to be the address of the API KEY',
          ) ||
          Date.now() + 2_000 > readinessDeadline
        ) {
          throw error;
        }

        readinessRetries += 1;
        await annotate(
          `Session-key order readiness retry: ${readinessRetries}`,
        );
        await delay(2_000);
        if (Date.now() >= readinessDeadline) {
          throw error;
        }
      }
    }

    const cancellation = await sessionClient.cancelOrder({ orderId });
    expect(cancellation.canceled).toContain(orderId);
    orderId = undefined;
  });
});
