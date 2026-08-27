import { OrderSide, OrderType } from '@polymarket/bindings';
import { describe, expect, it } from 'vitest';
import {
  adjustBuyAmountForFees,
  PrepareMarketOrderParamsSchema,
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
