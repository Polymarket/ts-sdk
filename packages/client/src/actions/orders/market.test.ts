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
  ] as const)('signs exactly maxPrice on tick $tickSize', async ({
    tickSize,
    maxPrice,
  }) => {
    const deps = createProtectedDeps(metadata(tickSize));
    const { amounts } = await resolveProtectedMarketOrderAmounts(
      buyParams({ amount: 50, maxPrice }),
      deps,
    );
    // An exact ratio lifts an ask at maxPrice and no higher ask, even if the
    // market's tick becomes finer after signing.
    expect(amounts.offeredAmount * FIXED_SCALE).toBe(
      amounts.requestedAmount * toScaledPrice(maxPrice),
    );
    expect(amounts.offeredAmount).toBeLessThanOrEqual(50_000_000n);
    expect(deps.fetchCurrentMarket).not.toHaveBeenCalled();
  });

  it.each([
    OrderType.FAK,
    OrderType.FOK,
  ] as const)('signs $1.05 for 15 shares when $1.09 buys at 0.07 (%s)', async (orderType) => {
    const deps = createProtectedDeps(metadata(0.01));
    const { amounts } = await resolveProtectedMarketOrderAmounts(
      buyParams({ amount: 1.09, maxPrice: 0.07, orderType }),
      deps,
    );

    expect(amounts).toEqual({
      offeredAmount: 1_050_000n,
      requestedAmount: 15_000_000n,
    });
    expect(deps.fetchCurrentMarket).not.toHaveBeenCalled();
    expect(deps.resolveBuilderTakerFeeRate).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    1.5,
  ])('rebuilds once when cached tick 0.1 has refined to 0.0001 (maxSpend %s)', async (maxSpend) => {
    const current = { ...metadata(0.0001), negRisk: true };
    const deps = createProtectedDeps(metadata(0.1), current);
    // 0.75 is off the cached 0.1 grid, so the order refreshes the market.
    const result = await resolveProtectedMarketOrderAmounts(
      buyParams({
        amount: maxSpend === undefined ? 1.5 : 100,
        maxPrice: 0.75,
        maxSpend,
      }),
      deps,
    );

    expect(result.amounts).toEqual({
      offeredAmount: 1_500_000n,
      requestedAmount: 2_000_000n,
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
  ] as const)('fails closed if no exact amount reaches the minimum after a refresh (%s)', async (orderType) => {
    const deps = createProtectedDeps(metadata(0.1));
    await expect(
      resolveProtectedMarketOrderAmounts(buyParams({ orderType }), deps),
    ).rejects.toThrow('cannot be spent exactly');
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

    // 0.75 is off the cached 0.1 grid, so the order refreshes the market. The
    // refreshed 7% fee and the 1% builder fee leave 1.51 of the 1.67 budget,
    // and 1.50 buys exactly 2 shares at 0.75.
    const { amounts } = await resolveProtectedMarketOrderAmounts(
      buyParams({ amount: 100, maxPrice: 0.75, maxSpend: 1.67 }),
      deps,
    );

    expect(amounts).toEqual({
      offeredAmount: 1_500_000n,
      requestedAmount: 2_000_000n,
    });
    expect(deps.fetchCurrentMarket).toHaveBeenCalledTimes(1);
    expect(deps.resolveBuilderTakerFeeRate).toHaveBeenCalledTimes(1);
  });

  it('checks exactness after fee resizing even when the original amount fits', async () => {
    const deps = createProtectedDeps(metadata(0.1));
    await expect(
      resolveProtectedMarketOrderAmounts(
        buyParams({ amount: 100, maxSpend: 1 }),
        deps,
      ),
    ).rejects.toThrow('cannot be spent exactly');
    expect(deps.fetchCurrentMarket).toHaveBeenCalledTimes(1);
  });

  it.each([
    { amount: 0.005 },
    { amount: 100, maxSpend: 0.005 },
  ])('rejects a BUY that rounds to zero (%j)', async (input) => {
    const deps = createProtectedDeps(metadata(0.0001));
    await expect(
      resolveProtectedMarketOrderAmounts(buyParams(input), deps),
    ).rejects.toThrow('cannot be spent exactly');
    expect(deps.fetchCurrentMarket).not.toHaveBeenCalled();
  });

  it('skips the refresh when the cached tick is already the finest', async () => {
    const deps = createProtectedDeps(metadata(0.0001), metadata(0.0001));
    await expect(
      resolveProtectedMarketOrderAmounts(
        buyParams({ amount: 100, maxSpend: 0.005 }),
        deps,
      ),
    ).rejects.toThrow('cannot be spent exactly');
    expect(deps.fetchCurrentMarket).not.toHaveBeenCalled();
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
      buyParams({ amount: 1.05, maxPrice: 0.07 }),
      deps,
    );
    expect(amounts.requestedAmount).toBe(15_000_000n);
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

  it('keeps the input error when the refresh fails, with the failure as cause', async () => {
    const deps = createProtectedDeps(metadata(0.1));
    const error = new Error('refresh unavailable');
    deps.fetchCurrentMarket.mockRejectedValue(error);
    const rejection = await resolveProtectedMarketOrderAmounts(
      buyParams(),
      deps,
    ).catch((caught: unknown) => caught);

    expect(rejection).toBeInstanceOf(UserInputError);
    expect((rejection as UserInputError).message).toContain(
      'cannot be spent exactly',
    );
    expect((rejection as UserInputError).cause).toBe(error);
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
