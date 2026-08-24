import { describe, expect, it } from 'vitest';
import {
  adjustBuyAmountForFees,
  platformFeeAmount,
  platformFeeRateFactor,
} from './fees';
import { Rounding, toScaledAmount, toScaledPrice } from './fixed';

describe('platformFeeRateFactor', () => {
  it('keeps the complete integer-power factor as an exact ratio', () => {
    expect(platformFeeRateFactor(toScaledPrice(0.05), 0.25, 2)).toEqual({
      numerator: 361n,
      denominator: 640_000n,
    });
  });

  it('keeps fractional exponents on a non-throwing compatibility path', () => {
    expect(platformFeeRateFactor(toScaledPrice(0.5), 0.25, 1.5)).toEqual({
      numerator: 1n,
      denominator: 32n,
    });
  });
});

describe('platformFeeAmount', () => {
  it('rounds only after applying the complete fee factor', () => {
    const factor = platformFeeRateFactor(toScaledPrice(0.05), 0.25, 2);

    expect(platformFeeAmount(toScaledAmount(100), factor, Rounding.Down)).toBe(
      56_400n,
    );
    expect(platformFeeAmount(toScaledAmount(100), factor, Rounding.Up)).toBe(
      56_410n,
    );
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
        price: toScaledPrice(0.5),
      }),
    ).toBe(10_000_000n);
  });

  it('reduces the buy spend using final-boundary platform fee rounding', () => {
    expect(
      adjustBuyAmountForFees({
        amount: 10,
        builderTakerFeeRate: 0,
        platformFeeExponent: 1,
        platformFeeRate: 0.02,
        maxSpend: 10,
        price: toScaledPrice(0.5),
      }),
    ).toBe(9_900_990n);
  });

  it('includes separately rounded builder taker fees in max spend', () => {
    expect(
      adjustBuyAmountForFees({
        amount: 10,
        builderTakerFeeRate: 0.01,
        platformFeeExponent: 1,
        platformFeeRate: 0.02,
        maxSpend: 10,
        price: toScaledPrice(0.5),
      }),
    ).toBe(9_803_920n);
  });
});
