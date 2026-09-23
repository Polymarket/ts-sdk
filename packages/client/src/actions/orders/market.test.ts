import { OrderSide, OrderType, type TickSizeValue } from '@polymarket/bindings';
import { describe, expect, it, vi } from 'vitest';
import { UserInputError } from '../../errors';
import type { OrderMarketMetadata } from './cache';
import { FIXED_SCALE, toScaledPrice } from './fixed';
import {
  adjustBuyAmountForFees,
  PrepareMarketOrderParamsSchema,
  type ProtectedMarketOrderDeps,
  resolveProtectedMarketOrderAmounts,
} from './market';

describe('PrepareMarketOrderParamsSchema', () => {
  it('normalizes the deprecated token ID input to an asset ID', () => {
    expect(
      PrepareMarketOrderParamsSchema.parse({
        amount: 10,
        side: OrderSide.BUY,
        tokenId: '123',
      }),
    ).toEqual({
      amount: 10,
      assetId: '123',
      orderType: OrderType.FAK,
      side: OrderSide.BUY,
    });
  });
});

describe('protected market order amounts', () => {
  it.each([
    { tickSize: 0.1, maxPrice: 0.3 },
    { tickSize: 0.01, maxPrice: 0.37 },
    { tickSize: 0.005, maxPrice: 0.375 },
    { tickSize: 0.0025, maxPrice: 0.3725 },
    { tickSize: 0.001, maxPrice: 0.373 },
    { tickSize: 0.0001, maxPrice: 0.3729 },
  ] as const)('preserves the execution bound on tick $tickSize', async ({
    tickSize,
    maxPrice,
  }) => {
    const deps = createProtectedDeps(metadata(tickSize));
    const { amounts } = await resolveProtectedMarketOrderAmounts(
      buyParams({ amount: 12.34, maxPrice }),
      deps,
    );
    expect(amounts.offeredAmount).toBe(12_340_000n);
    expect(amounts.offeredAmount * FIXED_SCALE).toBeGreaterThanOrEqual(
      amounts.requestedAmount * toScaledPrice(maxPrice),
    );
    expect(amounts.offeredAmount * FIXED_SCALE).toBeLessThan(
      amounts.requestedAmount *
        (toScaledPrice(maxPrice) + toScaledPrice(0.0001)),
    );
    expect(deps.fetchCurrentMarket).not.toHaveBeenCalled();
  });

  it.each([
    OrderType.FAK,
    OrderType.FOK,
  ] as const)('makes a $1 BUY at 0.07 marketable without crossing the next tick (%s)', async (orderType) => {
    const deps = createProtectedDeps(metadata(0.01));
    const { amounts } = await resolveProtectedMarketOrderAmounts(
      buyParams({ maxPrice: 0.07, orderType }),
      deps,
    );

    expect(amounts).toEqual({
      offeredAmount: 1_000_000n,
      requestedAmount: 14_285_700n,
    });
    expect(amounts.offeredAmount * FIXED_SCALE).toBeGreaterThanOrEqual(
      amounts.requestedAmount * toScaledPrice(0.07),
    );
    expect(amounts.offeredAmount * FIXED_SCALE).toBeLessThan(
      amounts.requestedAmount * toScaledPrice(0.0701),
    );
    expect(deps.fetchCurrentMarket).not.toHaveBeenCalled();
    expect(deps.resolveBuilderTakerFeeRate).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    1,
  ])('rebuilds once when cached tick 0.1 has refined to 0.0001 (maxSpend %s)', async (maxSpend) => {
    const current = { ...metadata(0.0001), negRisk: true };
    const deps = createProtectedDeps(metadata(0.1), current);
    const result = await resolveProtectedMarketOrderAmounts(
      buyParams({ amount: maxSpend === undefined ? 1 : 100, maxSpend }),
      deps,
    );

    expect(result.amounts).toEqual({
      offeredAmount: 1_000_000n,
      requestedAmount: 1_428_571n,
    });
    expect(result.metadata).toBe(current);
    expect(deps.resolveMarket).toHaveBeenCalledTimes(1);
    expect(deps.fetchCurrentMarket).toHaveBeenCalledTimes(1);
    expect(deps.resolveBuilderTakerFeeRate).toHaveBeenCalledTimes(
      maxSpend === undefined ? 0 : 1,
    );
  });

  it.each([
    OrderType.FAK,
    OrderType.FOK,
  ] as const)('fails closed if refreshed coarse precision still cannot preserve maxPrice (%s)', async (orderType) => {
    const deps = createProtectedDeps(metadata(0.1));
    await expect(
      resolveProtectedMarketOrderAmounts(buyParams({ orderType }), deps),
    ).rejects.toThrow('Cannot preserve maxPrice');
    expect(deps.fetchCurrentMarket).toHaveBeenCalledTimes(1);
  });

  it('resizes from the original amount and refreshed platform fees, retaining the builder fee', async () => {
    const current = {
      ...metadata(0.0001),
      feeInfo: { rate: 0.07, exponent: 0 },
    };
    const deps = createProtectedDeps(
      { ...metadata(0.1), feeInfo: { rate: 0.007, exponent: 0 } },
      current,
    );
    deps.resolveBuilderTakerFeeRate.mockResolvedValue(0.01);

    const { amounts } = await resolveProtectedMarketOrderAmounts(
      buyParams({ amount: 100, maxSpend: 1.11 }),
      deps,
    );

    expect(amounts).toEqual({
      offeredAmount: 1_000_000n,
      requestedAmount: 1_428_571n,
    });
    expect(deps.fetchCurrentMarket).toHaveBeenCalledTimes(1);
    expect(deps.resolveBuilderTakerFeeRate).toHaveBeenCalledTimes(1);
  });

  it('checks safety after fee resizing even when the original amount is safe', async () => {
    const deps = createProtectedDeps(metadata(0.1));
    await expect(
      resolveProtectedMarketOrderAmounts(
        buyParams({ amount: 100, maxSpend: 1 }),
        deps,
      ),
    ).rejects.toThrow('Cannot preserve maxPrice');
    expect(deps.fetchCurrentMarket).toHaveBeenCalledTimes(1);
  });

  it.each([
    { amount: 0.005 },
    { amount: 100, maxSpend: 0.005 },
  ])('rejects a BUY that rounds to zero (%j)', async (input) => {
    const deps = createProtectedDeps(metadata(0.0001));
    await expect(
      resolveProtectedMarketOrderAmounts(buyParams(input), deps),
    ).rejects.toThrow('rounds to zero');
    expect(deps.fetchCurrentMarket).toHaveBeenCalledTimes(1);
  });

  it('reuses cached metadata for an exactly representable coarse-tick BUY', async () => {
    const deps = createProtectedDeps(metadata(0.1));
    const { amounts } = await resolveProtectedMarketOrderAmounts(
      buyParams({ maxPrice: 0.1 }),
      deps,
    );
    expect(amounts).toEqual({
      offeredAmount: 1_000_000n,
      requestedAmount: 10_000_000n,
    });
    expect(deps.fetchCurrentMarket).not.toHaveBeenCalled();
  });

  it('keeps the price-grid refresh in the same single retry boundary', async () => {
    const deps = createProtectedDeps(metadata(0.1), metadata(0.01));
    const { amounts } = await resolveProtectedMarketOrderAmounts(
      buyParams({ maxPrice: 0.07 }),
      deps,
    );
    expect(amounts.requestedAmount).toBe(14_285_700n);
    expect(deps.fetchCurrentMarket).toHaveBeenCalledTimes(1);
  });

  it('does not retry a metadata fetch error as an invalid order', async () => {
    const deps = createProtectedDeps(metadata(0.1));
    const error = new Error('metadata unavailable');
    deps.resolveMarket.mockRejectedValue(error);
    await expect(
      resolveProtectedMarketOrderAmounts(buyParams(), deps),
    ).rejects.toBe(error);
    expect(deps.fetchCurrentMarket).not.toHaveBeenCalled();
  });

  it('propagates a refresh failure without another attempt', async () => {
    const deps = createProtectedDeps(metadata(0.1));
    const error = new Error('refresh unavailable');
    deps.fetchCurrentMarket.mockRejectedValue(error);
    await expect(
      resolveProtectedMarketOrderAmounts(buyParams(), deps),
    ).rejects.toBe(error);
    expect(deps.fetchCurrentMarket).toHaveBeenCalledTimes(1);
  });

  it('preserves protected SELL amounts and the existing price-grid recovery', async () => {
    const deps = createProtectedDeps(metadata(0.1), metadata(0.01));
    const { amounts } = await resolveProtectedMarketOrderAmounts(
      PrepareMarketOrderParamsSchema.parse({
        tokenId: '123',
        side: OrderSide.SELL,
        shares: 180,
        minPrice: 0.54,
      }),
      deps,
    );
    expect(amounts).toEqual({
      offeredAmount: 180_000_000n,
      requestedAmount: 97_200_000n,
    });
    expect(deps.fetchCurrentMarket).toHaveBeenCalledTimes(1);
    expect(deps.resolveBuilderTakerFeeRate).not.toHaveBeenCalled();
  });

  it('reports the existing public error type when safe sizing is impossible', async () => {
    await expect(
      resolveProtectedMarketOrderAmounts(
        buyParams(),
        createProtectedDeps(metadata(0.1)),
      ),
    ).rejects.toBeInstanceOf(UserInputError);
  });
});

function metadata(tickSize: TickSizeValue): OrderMarketMetadata {
  return { feeInfo: { rate: 0, exponent: 0 }, negRisk: false, tickSize };
}

function createProtectedDeps(cached: OrderMarketMetadata, current = cached) {
  return {
    resolveMarket: vi.fn(async () => cached),
    fetchCurrentMarket: vi.fn(async () => current),
    resolveBuilderTakerFeeRate: vi.fn(async () => 0),
  } satisfies ProtectedMarketOrderDeps;
}

function buyParams(
  input: {
    amount?: number;
    maxPrice?: number;
    maxSpend?: number;
    orderType?: OrderType.FAK | OrderType.FOK;
  } = {},
) {
  return PrepareMarketOrderParamsSchema.parse({
    assetId: '123',
    amount: 1,
    maxPrice: 0.7,
    side: OrderSide.BUY,
    ...input,
  });
}

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
