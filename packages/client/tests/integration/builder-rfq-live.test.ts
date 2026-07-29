import { OrderSide } from '@polymarket/bindings';
import {
  createSecureClient,
  FetchRfqStatusError,
  RfqStatus,
} from '@polymarket/client';
import { fetchRfqStatus } from '@polymarket/client/actions';
import { describe, expect, it, runMeteredTests } from './fixtures';

function loadComboLegPositionIds(): string[] | undefined {
  const legs = process.env.POLYMARKET_COMBO_LEG_POSITION_IDS?.split(',')
    .map((leg) => leg.trim())
    .filter((leg) => leg !== '');

  return legs !== undefined && legs.length >= 2 ? legs : undefined;
}

describe('Builder gateway combo RFQ integration', () => {
  it('rejects status reads for unknown RFQs', { timeout: 60_000 }, async ({
    builderAuthentication,
    depositWalletAddress,
    depositWalletSigner,
  }) => {
    const client = await createSecureClient({
      apiKey: builderAuthentication,
      signer: depositWalletSigner,
      wallet: depositWalletAddress,
    });

    const error = await fetchRfqStatus(client, {
      rfqId: 'rfq-00000000-0000-0000-0000-000000000000',
    }).catch((caught: unknown) => caught);

    expect(FetchRfqStatusError.isError(error)).toBe(true);
    expect(error).toMatchObject({ name: 'RfqRequestRejectedError' });
  });

  // Metered: an accepted combo quote executes a live trade with real funds.
  it.runIf(runMeteredTests)(
    'requests, accepts, and waits for a combo fill',
    { timeout: 180_000 },
    async ({
      annotate,
      builderAuthentication,
      depositWalletAddress,
      depositWalletSigner,
      skip,
    }) => {
      const legPositionIds = loadComboLegPositionIds();

      if (legPositionIds === undefined) {
        skip('Set POLYMARKET_COMBO_LEG_POSITION_IDS to run this test.');
        return;
      }

      const client = await createSecureClient({
        apiKey: builderAuthentication,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });

      const result = await client.requestComboQuote({
        amount: 1,
        direction: OrderSide.BUY,
        legPositionIds,
      });

      if (result.quote === null) {
        annotate(`No quote available: ${result.reason}`);
        return;
      }

      annotate(
        `Quoted RFQ ${result.rfqId} at ${result.quote.blendedPrice} for ${result.quote.totalRequired} total`,
      );

      const acceptance = await client.acceptComboQuote(result);

      if (acceptance.status === 'failed') {
        annotate(`Acceptance did not execute: ${acceptance.reason}`);
        return;
      }

      const fill = await client.waitForComboFill({
        rfqId: acceptance.rfqId,
        timeoutMs: 120_000,
      });

      annotate(`Terminal RFQ state: ${fill.status}`);

      if (fill.status === RfqStatus.Filled) {
        expect(fill.txHash).toMatch(/^0x/);
      }
    },
  );
});
