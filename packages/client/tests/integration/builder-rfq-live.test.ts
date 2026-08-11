import { OrderSide } from '@polymarket/bindings';
import {
  ComboAcceptFailureReason,
  type ComboMarket,
} from '@polymarket/bindings/combos';
import {
  createSecureClient,
  FetchRfqStatusError,
  type PublicClient,
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

// Combo-enabled markets churn as games resolve, so a fixed leg pair goes
// stale within days. Discover legs from the live catalog instead: YES
// positions of two unrelated markets (no shared slug prefix, so never the
// same event) cannot be contradictory, and mid-priced markets with volume
// are the likeliest to attract a maker quote.
async function discoverComboLegPositionIds(
  client: PublicClient,
): Promise<string[] | undefined> {
  const page = await client.listComboMarkets({ pageSize: 100 }).firstPage();
  const picked: ComboMarket[] = [];

  for (const market of page.items) {
    const price = Number(market.outcomes.yes.price);

    if (price < 0.05 || price > 0.95 || market.volume <= 0) continue;
    if (
      picked.some(
        (other) =>
          market.slug.startsWith(other.slug) ||
          other.slug.startsWith(market.slug),
      )
    ) {
      continue;
    }

    picked.push(market);

    if (picked.length === 2) {
      return picked.map((leg) => leg.outcomes.yes.positionId);
    }
  }

  return undefined;
}

describe('Builder gateway combo RFQ integration', () => {
  it('rejects status reads for unknown RFQs', { timeout: 60_000 }, async ({
    builderAuthentication,
    depositWalletAddress,
    depositWalletSigner,
    environment,
  }) => {
    const client = await createSecureClient({
      apiKey: builderAuthentication,
      environment,
      signer: depositWalletSigner,
      wallet: depositWalletAddress,
    });

    const error = await fetchRfqStatus(client, {
      rfqId: 'rfq-00000000-0000-0000-0000-000000000000',
    }).catch((caught: unknown) => caught);

    expect(FetchRfqStatusError.isError(error)).toBe(true);
    expect(error).toMatchObject({ name: 'RfqRequestRejectedError' });
  });

  it('returns exact net proceeds for a SELL quote', {
    timeout: 60_000,
  }, async ({
    annotate,
    builderAuthentication,
    depositWalletAddress,
    depositWalletSigner,
    environment,
    publicClient,
    skip,
  }) => {
    const legPositionIds =
      loadComboLegPositionIds() ??
      (await discoverComboLegPositionIds(publicClient));

    if (legPositionIds === undefined) {
      skip(
        'No combo legs discoverable; set POLYMARKET_COMBO_LEG_POSITION_IDS to override.',
      );
      return;
    }

    const client = await createSecureClient({
      apiKey: builderAuthentication,
      environment,
      signer: depositWalletSigner,
      wallet: depositWalletAddress,
    });
    const result = await client.requestComboQuote({
      direction: OrderSide.SELL,
      legPositionIds,
      size: 1,
    });

    if (result.quote === null) {
      skip(`No SELL quote available: ${result.reason}`);
      return;
    }
    if (result.quote.direction !== OrderSide.SELL) {
      expect.fail(`SELL request returned a ${result.quote.direction} quote`);
    }

    expect(Number(result.quote.netReceive)).toBeGreaterThan(0);
    annotate(
      `SELL RFQ ${result.rfqId} returns ${result.quote.netReceive} exact net proceeds; its signed-order limit is ${result.quote.takerAmount}`,
    );
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
      environment,
      publicClient,
      skip,
    }) => {
      const legPositionIds =
        loadComboLegPositionIds() ??
        (await discoverComboLegPositionIds(publicClient));

      if (legPositionIds === undefined) {
        skip(
          'No combo legs discoverable; set POLYMARKET_COMBO_LEG_POSITION_IDS to override.',
        );
        return;
      }

      const client = await createSecureClient({
        apiKey: builderAuthentication,
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });

      const result = await client.requestComboQuote({
        amount: 1,
        direction: OrderSide.BUY,
        legPositionIds,
      });

      if (result.quote === null) {
        skip(`No quote available: ${result.reason}`);
        return;
      }

      annotate(
        `Quoted RFQ ${result.rfqId} at ${result.quote.blendedPrice} for ${result.quote.totalRequired} total`,
      );

      const acceptance = await client.acceptComboQuote(result.quote);

      if (acceptance.status === 'failed') {
        // A maker declining or the window expiring is a market outcome; a
        // failure to execute an accepted quote is a defect.
        if (acceptance.reason === ComboAcceptFailureReason.ExecutionFailed) {
          expect.fail(
            `Acceptance of RFQ ${acceptance.rfqId} failed to execute: ${JSON.stringify(acceptance.error)}`,
          );
        }

        skip(`Acceptance did not execute: ${acceptance.reason}`);
        return;
      }

      const fill = await client.waitForComboFill({
        rfqId: acceptance.rfqId,
        timeoutMs: 120_000,
      });

      annotate(`Terminal RFQ state: ${fill.status}`);

      if (fill.status !== RfqStatus.Filled) {
        expect.fail(
          `RFQ ${acceptance.rfqId} was handed off for execution but ended ${fill.status}: ${JSON.stringify(fill.error)}`,
        );
      }

      expect(fill.txHash).toMatch(/^0x/);
    },
  );
});
