import { OrderSide } from '@polymarket/bindings';
import { OrderPostStatus } from '@polymarket/bindings/clob';
import {
  createSecureClient,
  SessionKeyKnownScope,
  SignerType,
} from '@polymarket/client';
import { privateKey } from '@polymarket/client/viem';
import { expectPresent } from '@polymarket/types';
import { http } from 'viem';
import { generatePrivateKey } from 'viem/accounts';
import { describe, expect, it, publicClient } from './fixtures';
import { expectAcceptedOrderResponse } from './helpers';
import { findHighVolumeLowPriceMarket } from './markets';

const SESSION_KEY_LIFETIME_SECONDS = 4_315 * 60 * 60;

const market = await findHighVolumeLowPriceMarket(publicClient, {
  sportsOnly: false,
});

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
  }) => {
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
    let revoked = false;

    annotate(`Market ID: ${market.id}`);
    annotate(`Token ID: ${tokenId}`);

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

      const cancellation = await sessionClient.cancelOrder({ orderId });
      expect(cancellation.canceled).toContain(orderId);
      orderId = undefined;

      const revocation = await secureClientWithDepositWallet.revokeSessionKey({
        address: sessionAddress,
      });
      revoked = true;

      annotate(
        `Revocation transaction: ${revocation.transaction.transactionHash}`,
      );
      expect(revocation.transaction.transactionHash).toMatch(
        /^0x[0-9a-f]{64}$/i,
      );
      expect(revocation.transaction.transactionId).not.toBeNull();

      const remainingSessionKeys =
        await secureClientWithDepositWallet.fetchSessionKeys();
      expect(
        remainingSessionKeys.some(
          (sessionKey) =>
            sessionKey.address.toLowerCase() === sessionAddress.toLowerCase(),
        ),
      ).toBe(false);
    } finally {
      if (orderId !== undefined) {
        await sessionClient.cancelOrder({ orderId }).catch(() => undefined);
      }
      if (!revoked) {
        await secureClientWithDepositWallet
          .revokeSessionKey({ address: sessionAddress })
          .catch(() => undefined);
      }
    }
  });
});
