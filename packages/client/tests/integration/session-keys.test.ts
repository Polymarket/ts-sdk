import { OrderSide } from '@polymarket/bindings';
import { OrderPostStatus } from '@polymarket/bindings/clob';
import { createSecureClient, SessionKeyScope } from '@polymarket/client';
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

describe('Session keys', { timeout: 300_000 }, () => {
  it('authorizes a CLOB session key that places and cancels a limit order', async ({
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
        scopes: [SessionKeyScope.CLOB],
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
      scopes: [SessionKeyScope.CLOB],
      validUntil,
    });

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
    await expect(sessionClient.openPerpsSession()).rejects.toThrow(
      'Perps is not supported with Session Keys',
    );

    const tokenId = expectPresent(market.outcomes.yes.tokenId);
    let orderId: string | undefined;

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
    } finally {
      if (orderId !== undefined) {
        await sessionClient.cancelOrder({ orderId }).catch(() => undefined);
      }
    }
  });
});
