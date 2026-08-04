import { OrderSide } from '@polymarket/bindings';
import { describe, expect, it } from 'vitest';
import { adjustBuyAmountForFees, computeMarketOrderAmounts } from './market';

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
