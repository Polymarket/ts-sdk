import { OrderSide } from '@polymarket/bindings';
import { createSecureClient } from '@polymarket/client';
import { cancelOrder, fetchApiKeys } from '@polymarket/client/actions';
import { signerFrom } from '@polymarket/client/ethers-v5';
import { expectPresent } from '@polymarket/types';
import { ethers } from 'ethers-v5';
import { polygon } from 'viem/chains';
import { describe, expect, it, runMeteredTests } from './fixtures';
import { expectAcceptedOrderResponse } from './helpers';
import { findHighVolumeLowPriceMarket } from './markets';

const provider = new ethers.providers.JsonRpcProvider(
  polygon.rpcUrls.default.http[0],
  {
    chainId: polygon.id,
    name: polygon.name,
  },
);

describe('ethers-v5', () => {
  it('authenticates a secure client', async ({
    depositWalletAddress,
    depositWalletPrivateKey,
  }) => {
    const secureClient = await createSecureClient({
      wallet: depositWalletAddress,
      signer: signerFrom(new ethers.Wallet(depositWalletPrivateKey, provider)),
    });

    await expect(fetchApiKeys(secureClient)).resolves.toBeDefined();
  });

  it.runIf(runMeteredTests)(
    'places and cancels a limit order',
    async ({
      depositWalletAddress,
      depositWalletPrivateKey,
      publicClient,
      relayerAuthentication,
    }) => {
      const market = await findHighVolumeLowPriceMarket(publicClient);
      const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
      const price = expectPresent(market.trading.minimumTickSize);
      const size = expectPresent(market.trading.minimumOrderSize);
      const secureClient = await createSecureClient({
        apiKey: relayerAuthentication,
        wallet: depositWalletAddress,
        signer: signerFrom(
          new ethers.Wallet(depositWalletPrivateKey, provider),
        ),
      });

      const response = await secureClient.placeLimitOrder({
        price,
        size,
        side: OrderSide.BUY,
        tokenId: yesTokenId,
      });

      expect(response.ok).toBe(true);
      const acceptedResponse = expectAcceptedOrderResponse(response);

      await expect(
        cancelOrder(secureClient, { orderId: acceptedResponse.orderId }),
      ).resolves.toEqual(
        expect.objectContaining({
          canceled: expect.arrayContaining([acceptedResponse.orderId]),
        }),
      );
    },
  );
});
