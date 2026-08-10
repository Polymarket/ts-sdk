import {
  type BuilderCode,
  createSecureClient,
  OrderSide,
  type PublicClient,
} from '@polymarket/client';
import { delay, expectPresent } from '@polymarket/types';
import { describe, expect, it, runMeteredTests } from './fixtures';
import { findHighVolumeLowPriceMarket } from './markets';

describe('Builders', () => {
  describe('listBuilderTrades', () => {
    it.runIf(runMeteredTests)(
      'lists builder-attributed trades',
      async ({
        builderAuthentication,
        builderCode,
        depositWalletAddress,
        depositWalletSigner,
        environment,
        publicClient,
      }) => {
        const existingTrades = await publicClient
          .listBuilderTrades({ builderCode })
          .firstPage()
          .then((page) => page.items);

        if (existingTrades.length > 0) {
          expect(existingTrades[0]).toEqual(
            expect.objectContaining({
              id: expect.any(String),
              tokenId: expect.any(String),
            }),
          );
          return;
        }

        const secureClient = await createSecureClient({
          apiKey: builderAuthentication,
          environment,
          signer: depositWalletSigner,
          wallet: depositWalletAddress,
        });
        const market = await findHighVolumeLowPriceMarket(publicClient);
        const tokenId = expectPresent(market.outcomes.yes.tokenId);

        const response = await secureClient.placeMarketOrder({
          amount: expectPresent(market.trading.minimumOrderSize),
          builderCode,
          side: OrderSide.BUY,
          tokenId,
        });

        expect(response.ok).toBe(true);

        const newTrades = await waitForBuilderTrades(
          publicClient,
          builderCode,
          tokenId,
        );

        expect(newTrades[0]).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            tokenId,
          }),
        );
      },
      20_000,
    );
  });
});

async function waitForBuilderTrades(
  client: PublicClient,
  builderCode: BuilderCode,
  tokenId: string,
) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { items } = await client
      .listBuilderTrades({ builderCode, tokenId })
      .firstPage();

    if (items.length > 0) {
      return items;
    }

    await delay(500);
  }

  const { items } = await client
    .listBuilderTrades({ builderCode, tokenId })
    .firstPage();

  expect(items.length).toBeGreaterThan(0);

  return items;
}
