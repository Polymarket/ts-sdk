import { OrderSide } from '@polymarket/bindings';
import { expectEvmAddress, okAsync } from '@polymarket/types';
import { describe, expect, it, vi } from 'vitest';
import type { BaseSecureClient } from '../../clients';
import { forkEnvironmentConfig } from '../../environments';
import {
  adjustBuyAmountForFees,
  computeMarketOrderAmounts,
  PrepareMarketOrderParamsSchema,
  prepareMarketOrderDraft,
} from './market';

describe('computeMarketOrderAmounts', () => {
  it('encodes a buy max price as minimum shares received', () => {
    expect(
      computeMarketOrderAmounts({
        amount: 100,
        price: 0.55,
        protectPrice: true,
        side: OrderSide.BUY,
        tickSize: 0.01,
      }),
    ).toEqual({
      offeredAmount: 100_000_000n,
      requestedAmount: 181_818_200n,
    });
  });

  it('encodes a sell min price as minimum proceeds received', () => {
    expect(
      computeMarketOrderAmounts({
        amount: 180,
        price: 0.54,
        protectPrice: true,
        side: OrderSide.SELL,
        tickSize: 0.01,
      }),
    ).toEqual({
      offeredAmount: 180_000_000n,
      requestedAmount: 97_200_000n,
    });
  });
});

describe('adjustBuyAmountForFees', () => {
  it('keeps the amount unchanged when max spend covers amount plus fees', () => {
    expect(
      adjustBuyAmountForFees({
        amount: 10,
        builderTakerFeeRate: 0,
        platformFeeExponent: 1,
        platformFeeRate: 0.02,
        maxSpend: 11,
        price: 0.5,
      }),
    ).toBe(10);
  });

  it('reduces the buy spend when platform fees exceed max spend', () => {
    expect(
      adjustBuyAmountForFees({
        amount: 10,
        builderTakerFeeRate: 0,
        platformFeeExponent: 1,
        platformFeeRate: 0.02,
        maxSpend: 10,
        price: 0.5,
      }),
    ).toBeCloseTo(9.900990099);
  });

  it('includes builder taker fees when sizing against max spend', () => {
    expect(
      adjustBuyAmountForFees({
        amount: 10,
        builderTakerFeeRate: 0.01,
        platformFeeExponent: 1,
        platformFeeRate: 0.02,
        maxSpend: 10,
        price: 0.5,
      }),
    ).toBeCloseTo(9.803921568);
  });
});

describe('prepareMarketOrderDraft', () => {
  it('resolves market metadata once across repeated protected drafts', async () => {
    const { client, requests, totalRequests } = createClient();
    const params = PrepareMarketOrderParamsSchema.parse({
      amount: 10,
      maxPrice: 0.55,
      side: OrderSide.BUY,
      tokenId: TOKEN_ID,
    });

    const first = await prepareMarketOrderDraft(client, params);
    const second = await prepareMarketOrderDraft(client, params);

    expect(first).toEqual(second);
    expect(requests(`/markets-by-token/${TOKEN_ID}`)).toBe(1);
    expect(requests(`/clob-markets/${CONDITION_ID}`)).toBe(1);
    expect(requests('/book')).toBe(0);
    expect(requests('/tick-size')).toBe(0);
    expect(requests('/neg-risk')).toBe(0);
    expect(totalRequests()).toBe(2);
  });

  it('fetches the order book on every unprotected draft', async () => {
    const { client, requests } = createClient();
    const params = PrepareMarketOrderParamsSchema.parse({
      amount: 10,
      side: OrderSide.BUY,
      tokenId: TOKEN_ID,
    });

    await prepareMarketOrderDraft(client, params);
    await prepareMarketOrderDraft(client, params);

    expect(requests('/book')).toBe(2);
    expect(requests(`/markets-by-token/${TOKEN_ID}`)).toBe(1);
    expect(requests(`/clob-markets/${CONDITION_ID}`)).toBe(1);
  });

  it('skips builder fee rates for drafts that do not use them', async () => {
    const { client, requests } = createClient();

    await prepareMarketOrderDraft(
      client,
      PrepareMarketOrderParamsSchema.parse({
        builderCode: BUILDER_CODE,
        minPrice: 0.54,
        shares: 180,
        side: OrderSide.SELL,
        tokenId: TOKEN_ID,
      }),
    );
    await prepareMarketOrderDraft(
      client,
      PrepareMarketOrderParamsSchema.parse({
        amount: 10,
        builderCode: BUILDER_CODE,
        maxPrice: 0.55,
        side: OrderSide.BUY,
        tokenId: TOKEN_ID,
      }),
    );

    expect(requests('/fees/builder-fees/')).toBe(0);
  });

  it('fetches builder fee rates once for buy drafts capped by maxSpend', async () => {
    const { client, requests } = createClient();
    const params = PrepareMarketOrderParamsSchema.parse({
      amount: 10,
      builderCode: BUILDER_CODE,
      maxPrice: 0.55,
      maxSpend: 10,
      side: OrderSide.BUY,
      tokenId: TOKEN_ID,
    });

    await prepareMarketOrderDraft(client, params);
    await prepareMarketOrderDraft(client, params);

    expect(requests(`/fees/builder-fees/${BUILDER_CODE}`)).toBe(1);
  });
});

const TOKEN_ID = '111';
const CONDITION_ID = `0x${'ab'.repeat(32)}`;
const BUILDER_CODE = `0x${'cd'.repeat(32)}`;

function createClient() {
  const clobGet = vi.fn((path: string) => {
    if (path === `/markets-by-token/${TOKEN_ID}`) {
      return okAsync(jsonResponse({ condition_id: CONDITION_ID }));
    }

    if (path === `/clob-markets/${CONDITION_ID}`) {
      return okAsync(
        jsonResponse({
          fd: { r: 0.02, e: 1 },
          mts: 0.01,
          t: [
            { t: TOKEN_ID, o: 'Yes' },
            { t: '222', o: 'No' },
          ],
        }),
      );
    }

    if (path === '/book') {
      return okAsync(
        jsonResponse({
          market: CONDITION_ID,
          asset_id: TOKEN_ID,
          bids: [
            { price: '0.5', size: '100' },
            { price: '0.54', size: '200' },
          ],
          asks: [
            { price: '0.6', size: '100' },
            { price: '0.55', size: '100' },
          ],
          min_order_size: '5',
          tick_size: '0.01',
          neg_risk: false,
          hash: 'a'.repeat(40),
        }),
      );
    }

    if (path.startsWith('/fees/builder-fees/')) {
      return okAsync(
        jsonResponse({
          builder_maker_fee_rate_bps: 100,
          builder_taker_fee_rate_bps: 200,
        }),
      );
    }

    throw new Error(`Unexpected request path: ${path}`);
  });

  const client = {
    account: {
      signer: expectEvmAddress('0x1111111111111111111111111111111111111111'),
      wallet: expectEvmAddress('0x2222222222222222222222222222222222222222'),
    },
    clob: { get: clobGet },
    environment: forkEnvironmentConfig({ name: 'test' }),
  } as unknown as BaseSecureClient;

  return {
    client,
    requests(prefix: string): number {
      return clobGet.mock.calls.filter(([path]) => path.startsWith(prefix))
        .length;
    },
    totalRequests(): number {
      return clobGet.mock.calls.length;
    },
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}
