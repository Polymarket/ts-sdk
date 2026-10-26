import { OrderSide, type TickSizeValue } from '@polymarket/bindings';
import { describe, expect, it } from 'vitest';
import { UserInputError } from '../../errors';
import { computeLimitOrderAmounts, computeMarketOrderAmounts } from './amounts';
import { resolveRoundingConfig, validatePriceOnTickGrid } from './context';
import { FIXED_SCALE, type ScaledPrice, toScaledPrice } from './fixed';

const INPUT_AMOUNT = 12.34;
const SCALED_INPUT_AMOUNT = 12_340_000n;

const TICK_CASES = [
  {
    limitProduct: 3_702_000n,
    marketBuy: { offeredAmount: 12_330_000n, requestedAmount: 41_100_000n },
    scaledPrice: toScaledPrice(0.3),
    tickSize: 0.1,
  },
  {
    limitProduct: 4_565_800n,
    marketBuy: { offeredAmount: 12_210_000n, requestedAmount: 33_000_000n },
    scaledPrice: toScaledPrice(0.37),
    tickSize: 0.01,
  },
  {
    limitProduct: 4_627_500n,
    marketBuy: { offeredAmount: 12_330_000n, requestedAmount: 32_880_000n },
    scaledPrice: toScaledPrice(0.375),
    tickSize: 0.005,
  },
  {
    limitProduct: 4_596_650n,
    marketBuy: { offeredAmount: 11_920_000n, requestedAmount: 32_000_000n },
    scaledPrice: toScaledPrice(0.3725),
    tickSize: 0.0025,
  },
  {
    limitProduct: 4_602_820n,
    marketBuy: { offeredAmount: 11_190_000n, requestedAmount: 30_000_000n },
    scaledPrice: toScaledPrice(0.373),
    tickSize: 0.001,
  },
  {
    limitProduct: 4_601_586n,
    marketBuy: undefined,
    scaledPrice: toScaledPrice(0.3729),
    tickSize: 0.0001,
  },
] satisfies {
  limitProduct: bigint;
  marketBuy: { offeredAmount: bigint; requestedAmount: bigint } | undefined;
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
  it.each(
    TICK_CASES.filter(({ marketBuy }) => marketBuy !== undefined),
  )('encodes the BUY price exactly at tick size $tickSize', ({
    marketBuy,
    scaledPrice,
    tickSize,
  }) => {
    const amounts = computeMarketOrderAmounts({
      amount: INPUT_AMOUNT,
      price: scaledPrice,
      side: OrderSide.BUY,
      tickSize,
    });

    expect(amounts).toEqual(marketBuy);
    expectExactMarketBuy(amounts, SCALED_INPUT_AMOUNT, scaledPrice, tickSize);
  });

  it('signs $9.88 for 15.2 shares when $10 buys at 0.65', () => {
    // 0.13 USDC buys exactly 0.2 shares at 0.65; $10 holds 76 such steps.
    expect(
      computeMarketOrderAmounts({
        amount: 10,
        price: toScaledPrice(0.65),
        side: OrderSide.BUY,
        tickSize: 0.01,
      }),
    ).toEqual({
      offeredAmount: 9_880_000n,
      requestedAmount: 15_200_000n,
    });
  });

  it('rejects a $1 BUY at 0.07 whose steps fall below the minimum', () => {
    expect(() =>
      computeMarketOrderAmounts({
        amount: 1,
        price: toScaledPrice(0.07),
        side: OrderSide.BUY,
        tickSize: 0.01,
      }),
    ).toThrow(
      new UserInputError(
        'BUY amount 1 cannot be spent exactly at price 0.07. At this price the amount is used in steps of 0.07; use at least 1.05.',
      ),
    );
  });

  it('rejects a BUY smaller than one step', () => {
    expect(() =>
      computeMarketOrderAmounts({
        amount: INPUT_AMOUNT,
        price: toScaledPrice(0.3729),
        side: OrderSide.BUY,
        tickSize: 0.0001,
      }),
    ).toThrow('steps of 37.29; use at least 37.29');
  });

  it.each(TICK_CASES)('preserves exact BUY divisions at tick $tickSize', ({
    tickSize,
  }) => {
    expect(
      computeMarketOrderAmounts({
        amount: 1,
        price: toScaledPrice(0.5),
        side: OrderSide.BUY,
        tickSize,
      }),
    ).toEqual({
      offeredAmount: 1_000_000n,
      requestedAmount: 2_000_000n,
    });
  });

  it.each(
    TICK_CASES,
  )('spends the most an exact price allows at tick $tickSize', ({
    tickSize,
  }) => {
    const tick = toScaledPrice(tickSize);
    const ticks = FIXED_SCALE / tick;
    const stride = ticks / 97n > 0n ? ticks / 97n : 1n;
    const budgets = [1, 1.01, 3.33, 10, 25.5, 99.99, 250, 1000];

    for (let index = 1n; index < ticks; index += stride) {
      const price = (index * tick) as ScaledPrice;
      for (const budget of budgets) {
        const scaledBudget = BigInt(Math.round(budget * 100)) * 10_000n;
        const expected = exactBuyCollateralBySearch(
          scaledBudget,
          price,
          tickSize,
        );
        const compute = () =>
          computeMarketOrderAmounts({
            amount: budget,
            price,
            side: OrderSide.BUY,
            tickSize,
          });

        if (expected < 1_000_000n) {
          expect(compute).toThrow('cannot be spent exactly');
          continue;
        }
        const amounts = compute();
        expect(amounts.offeredAmount).toBe(expected);
        expectExactMarketBuy(amounts, scaledBudget, price, tickSize);
      }
    }
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
      offeredAmount: 12_210_000n,
      requestedAmount: 33_000_000n,
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

// The exchange admits an order only when its 6-decimal price divides exactly
// and lies on the market tick.
function exchangeAdmits(
  offeredAmount: bigint,
  requestedAmount: bigint,
  tickSize: TickSizeValue,
): boolean {
  if (
    requestedAmount <= 0n ||
    (offeredAmount * FIXED_SCALE) % requestedAmount !== 0n
  ) {
    return false;
  }
  const price = (offeredAmount * FIXED_SCALE) / requestedAmount;
  return price % toScaledPrice(tickSize) === 0n;
}

function expectExactMarketBuy(
  amounts: { offeredAmount: bigint; requestedAmount: bigint },
  budget: bigint,
  price: ScaledPrice,
  tickSize: TickSizeValue,
): void {
  const config = resolveRoundingConfig(tickSize);
  expect(amounts.offeredAmount * FIXED_SCALE).toBe(
    amounts.requestedAmount * price,
  );
  expect(
    exchangeAdmits(amounts.offeredAmount, amounts.requestedAmount, tickSize),
  ).toBe(true);
  expect(amounts.offeredAmount).toBeLessThanOrEqual(budget);
  expect(amounts.offeredAmount % 10n ** BigInt(6 - config.size)).toBe(0n);
  expect(amounts.requestedAmount % 10n ** BigInt(6 - config.amount)).toBe(0n);
}

// Largest whole-cent collateral within the budget that buys a whole number of
// share units at exactly the price.
function exactBuyCollateralBySearch(
  budget: bigint,
  price: ScaledPrice,
  tickSize: TickSizeValue,
): bigint {
  const config = resolveRoundingConfig(tickSize);
  const collateralUnit = 10n ** BigInt(6 - config.size);
  const shareUnit = 10n ** BigInt(6 - config.amount);
  for (
    let collateral = (budget / collateralUnit) * collateralUnit;
    collateral > 0n;
    collateral -= collateralUnit
  ) {
    const scaled = collateral * FIXED_SCALE;
    if (scaled % price === 0n && (scaled / price) % shareUnit === 0n) {
      return collateral;
    }
  }
  return 0n;
}
