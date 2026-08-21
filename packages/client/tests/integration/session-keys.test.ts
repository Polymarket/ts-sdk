import { OrderSide } from '@polymarket/bindings';
import { OrderPostStatus } from '@polymarket/bindings/clob';
import { createSecureClient, SessionKeyKnownScope } from '@polymarket/client';
import { privateKey } from '@polymarket/client/viem';
import { expectPresent } from '@polymarket/types';
import { http } from 'viem';
import { generatePrivateKey } from 'viem/accounts';
import { describe, expect, it, publicClient } from './fixtures';
import { expectAcceptedOrderResponse } from './helpers';
import { findHighVolumeLowPriceMarket } from './markets';

const market = await findHighVolumeLowPriceMarket(publicClient, {
  sportsOnly: false,
});

describe('Session keys', { timeout: 600_000 }, () => {
  it('authorizes, lists, uses, and revokes a default-scoped session key', async ({
    annotate,
    environment,
    secureClientWithDepositWallet,
  }) => {
    const sessionSigner = privateKey(generatePrivateKey(), {
      transport: http(environment.rpc),
    });
    const sessionAddress = await sessionSigner.getAddress();
    const validUntil = Math.floor(Date.now() / 1_000) + 15 * 60;
    const authorization =
      await secureClientWithDepositWallet.authorizeSessionKey({
        address: sessionAddress,
        validUntil,
      });

    annotate(`Session address: ${sessionAddress}`);
    annotate(`Authorization operation: ${authorization.operationId}`);
    annotate(
      `Authorization transaction: ${authorization.transaction.transactionHash}`,
    );
    expect(authorization.transaction.transactionHash).toMatch(
      /^0x[0-9a-f]{64}$/i,
    );
    expect(authorization.transaction.transactionId).not.toBeNull();
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

      annotate(`Revocation operation: ${revocation.operationId}`);
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
