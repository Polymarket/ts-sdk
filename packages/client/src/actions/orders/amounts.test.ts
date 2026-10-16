import { OrderSide, type TickSizeValue } from '@polymarket/bindings';
import { describe, expect, it } from 'vitest';
import { computeLimitOrderAmounts, computeMarketOrderAmounts } from './amounts';
import { validatePriceOnTickGrid } from './context';
import { FIXED_SCALE, type ScaledPrice, toScaledPrice } from './fixed';

const INPUT_AMOUNT = 12.34;
const SCALED_INPUT_AMOUNT = 12_340_000n;

const TICK_CASES = [
  {
    limitProduct: 3_702_000n,
    marketBuyDown: 41_133_000n,
    scaledPrice: toScaledPrice(0.3),
    tickSize: 0.1,
  },
  {
    limitProduct: 4_565_800n,
    marketBuyDown: 33_351_300n,
    scaledPrice: toScaledPrice(0.37),
    tickSize: 0.01,
  },
  {
    limitProduct: 4_627_500n,
    marketBuyDown: 32_906_660n,
    scaledPrice: toScaledPrice(0.375),
    tickSize: 0.005,
  },
  {
    limitProduct: 4_596_650n,
    marketBuyDown: 33_127_516n,
    scaledPrice: toScaledPrice(0.3725),
    tickSize: 0.0025,
  },
  {
    limitProduct: 4_602_820n,
    marketBuyDown: 33_083_100n,
    scaledPrice: toScaledPrice(0.373),
    tickSize: 0.001,
  },
  {
    limitProduct: 4_601_586n,
    marketBuyDown: 33_091_981n,
    scaledPrice: toScaledPrice(0.3729),
    tickSize: 0.0001,
  },
] satisfies {
  limitProduct: bigint;
  marketBuyDown: bigint;
  scaledPrice: ScaledPrice;
  tickSize: TickSizeValue;
}[];

describe('computeLimitOrderAmounts', () => {
  it.each(TICK_CASES)('encodes BUY amounts at tick size $tickSize', ({
    limitProduct,
    scaledPrice,
    tickSize,
  }) => {
    expect(
      computeLimitOrderAmounts({
        price: scaledPrice,
        side: OrderSide.BUY,
        size: INPUT_AMOUNT,
        tickSize,
      }),
    ).toEqual({
      offeredAmount: limitProduct,
      requestedAmount: SCALED_INPUT_AMOUNT,
    });
  });

  it.each(TICK_CASES)('encodes SELL amounts at tick size $tickSize', ({
    limitProduct,
    scaledPrice,
    tickSize,
  }) => {
    expect(
      computeLimitOrderAmounts({
        price: scaledPrice,
        side: OrderSide.SELL,
        size: INPUT_AMOUNT,
        tickSize,
      }),
    ).toEqual({
      offeredAmount: SCALED_INPUT_AMOUNT,
      requestedAmount: limitProduct,
    });
  });

  it('rounds the public size down to two decimals before calculating amounts', () => {
    expect(
      computeLimitOrderAmounts({
        price: toScaledPrice(0.37),
        side: OrderSide.BUY,
        size: 12.349,
        tickSize: 0.01,
      }),
    ).toEqual({
      offeredAmount: 4_565_800n,
      requestedAmount: SCALED_INPUT_AMOUNT,
    });
  });

  it('preserves a two-decimal size whose scaled product drifts down', () => {
    expect(
      computeLimitOrderAmounts({
        price: toScaledPrice(0.5),
        side: OrderSide.BUY,
        size: 2.01,
        tickSize: 0.1,
      }),
    ).toEqual({
      offeredAmount: 1_005_000n,
      requestedAmount: 2_010_000n,
    });
  });

  it('calculates amounts from a price normalized after arithmetic', () => {
    const price = validatePriceOnTickGrid(0.4 + 0.2, 0.1);

    expect(
      computeLimitOrderAmounts({
        price,
        side: OrderSide.BUY,
        size: 10,
        tickSize: 0.1,
      }),
    ).toEqual({
      offeredAmount: 6_000_000n,
      requestedAmount: 10_000_000n,
    });
  });
});

describe('computeMarketOrderAmounts', () => {
  it.each(TICK_CASES)('rounds BUY shares down at tick size $tickSize', ({
    marketBuyDown,
    scaledPrice,
    tickSize,
  }) => {
    const amounts = computeMarketOrderAmounts({
      amount: INPUT_AMOUNT,
      price: scaledPrice,
      side: OrderSide.BUY,
      tickSize,
    });

    expect(amounts).toEqual({
      offeredAmount: SCALED_INPUT_AMOUNT,
      requestedAmount: marketBuyDown,
    });
    expect(amounts.offeredAmount * FIXED_SCALE).toBeGreaterThanOrEqual(
      amounts.requestedAmount * scaledPrice,
    );
  });

  it('rounds a $1 BUY at 0.07 down to 14.2857 shares', () => {
    const price = toScaledPrice(0.07);
    const amounts = computeMarketOrderAmounts({
      amount: 1,
      price,
      side: OrderSide.BUY,
      tickSize: 0.01,
    });

    expect(amounts).toEqual({
      offeredAmount: 1_000_000n,
      requestedAmount: 14_285_700n,
    });
    expect(amounts.offeredAmount * FIXED_SCALE).toBeGreaterThanOrEqual(
      amounts.requestedAmount * price,
    );
  });

  it.each(TICK_CASES)('preserves exact BUY divisions at tick $tickSize', ({
    tickSize,
  }) => {
    const price = toScaledPrice(0.5);
    const amounts = computeMarketOrderAmounts({
      amount: 1,
      price,
      side: OrderSide.BUY,
      tickSize,
    });

    expect(amounts).toEqual({
      offeredAmount: 1_000_000n,
      requestedAmount: 2_000_000n,
    });
    expect(amounts.offeredAmount * FIXED_SCALE).toBe(
      amounts.requestedAmount * price,
    );
  });

  it.each(TICK_CASES)('preserves SELL proceeds at tick size $tickSize', ({
    limitProduct,
    scaledPrice,
    tickSize,
  }) => {
    expect(
      computeMarketOrderAmounts({
        amount: INPUT_AMOUNT,
        price: scaledPrice,
        side: OrderSide.SELL,
        tickSize,
      }),
    ).toEqual({
      offeredAmount: SCALED_INPUT_AMOUNT,
      requestedAmount: limitProduct,
    });
  });

  it('rounds the public amount down to two decimals before calculating amounts', () => {
    expect(
      computeMarketOrderAmounts({
        amount: 12.349,
        price: toScaledPrice(0.37),
        side: OrderSide.BUY,
        tickSize: 0.01,
      }),
    ).toEqual({
      offeredAmount: SCALED_INPUT_AMOUNT,
      requestedAmount: 33_351_300n,
    });
  });

  it('preserves a two-decimal amount whose scaled product drifts down', () => {
    expect(
      computeMarketOrderAmounts({
        amount: 8.03,
        price: toScaledPrice(0.5),
        side: OrderSide.SELL,
        tickSize: 0.1,
      }),
    ).toEqual({
      offeredAmount: 8_030_000n,
      requestedAmount: 4_015_000n,
    });
  });

  it('preserves exact SELL proceeds for a fractional share amount', () => {
    expect(
      computeMarketOrderAmounts({
        amount: 9.99,
        price: toScaledPrice(0.1),
        side: OrderSide.SELL,
        tickSize: 0.1,
      }),
    ).toEqual({
      offeredAmount: 9_990_000n,
      requestedAmount: 999_000n,
    });
  });
});
