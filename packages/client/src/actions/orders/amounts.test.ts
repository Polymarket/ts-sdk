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
    marketBuy: { offeredAmount: 12_339_000n, requestedAmount: 41_130_000n },
    scaledPrice: toScaledPrice(0.3),
    tickSize: 0.1,
  },
  {
    limitProduct: 4_565_800n,
    marketBuy: { offeredAmount: 12_339_500n, requestedAmount: 33_350_000n },
    scaledPrice: toScaledPrice(0.37),
    tickSize: 0.01,
  },
  {
    limitProduct: 4_627_500n,
    marketBuy: { offeredAmount: 12_339_990n, requestedAmount: 32_906_640n },
    scaledPrice: toScaledPrice(0.375),
    tickSize: 0.005,
  },
  {
    limitProduct: 4_596_650n,
    marketBuy: { offeredAmount: 12_339_882n, requestedAmount: 33_127_200n },
    scaledPrice: toScaledPrice(0.3725),
    tickSize: 0.0025,
  },
  {
    limitProduct: 4_602_820n,
    marketBuy: { offeredAmount: 12_338_840n, requestedAmount: 33_080_000n },
    scaledPrice: toScaledPrice(0.373),
    tickSize: 0.001,
  },
  {
    limitProduct: 4_601_586n,
    marketBuy: { offeredAmount: 12_339_261n, requestedAmount: 33_090_000n },
    scaledPrice: toScaledPrice(0.3729),
    tickSize: 0.0001,
  },
] satisfies {
  limitProduct: bigint;
  marketBuy: { offeredAmount: bigint; requestedAmount: bigint };
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
  it.each(TICK_CASES)('encodes the BUY price exactly at tick size $tickSize', ({
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

  it('signs $9.9996 for 15.384 shares when $10 buys at 0.65', () => {
    // 0.0013 USDC buys exactly 0.002 shares at 0.65; $10 holds 7692 such steps.
    expect(
      computeMarketOrderAmounts({
        amount: 10,
        price: toScaledPrice(0.65),
        side: OrderSide.BUY,
        tickSize: 0.01,
      }),
    ).toEqual({
      offeredAmount: 9_999_600n,
      requestedAmount: 15_384_000n,
    });
  });

  it.each([
    { price: 0.7, tickSize: 0.1, offeredAmount: 994_000n },
    { price: 0.65, tickSize: 0.01, offeredAmount: 999_700n },
    { price: 0.07, tickSize: 0.01, offeredAmount: 999_600n },
    { price: 0.335, tickSize: 0.005, offeredAmount: 999_640n },
    { price: 0.4325, tickSize: 0.0025, offeredAmount: 999_940n },
    { price: 0.962, tickSize: 0.001, offeredAmount: 995_670n },
    { price: 0.9999, tickSize: 0.0001, offeredAmount: 999_900n },
  ] as const)('keeps a $1 BUY at $price above the minimum on tick $tickSize', ({
    price,
    tickSize,
    offeredAmount,
  }) => {
    const amounts = computeMarketOrderAmounts({
      amount: 1,
      price: toScaledPrice(price),
      side: OrderSide.BUY,
      tickSize,
    });

    expect(amounts.offeredAmount).toBe(offeredAmount);
    expectExactMarketBuy(amounts, 1_000_000n, toScaledPrice(price), tickSize);
  });

  it('accepts a BUY of exactly the minimum', () => {
    expect(
      computeMarketOrderAmounts({
        amount: 0.99,
        price: toScaledPrice(0.5),
        side: OrderSide.BUY,
        tickSize: 0.01,
      }),
    ).toEqual({
      offeredAmount: 990_000n,
      requestedAmount: 1_980_000n,
    });
  });

  it('rejects a $0.99 BUY at 0.65 whose steps fall below the minimum', () => {
    // 761 steps of 0.0013 make 0.9893.
    expect(() =>
      computeMarketOrderAmounts({
        amount: 0.99,
        price: toScaledPrice(0.65),
        side: OrderSide.BUY,
        tickSize: 0.01,
      }),
    ).toThrow(
      new UserInputError(
        'BUY amount 0.99 cannot be spent exactly at price 0.65. At this price the amount is used in steps of 0.0013; use at least 0.9906.',
      ),
    );
  });

  it.each([0.001, 0.5])('rejects a BUY of %s, below the minimum', (amount) => {
    expect(() =>
      computeMarketOrderAmounts({
        amount,
        price: toScaledPrice(0.65),
        side: OrderSide.BUY,
        tickSize: 0.01,
      }),
    ).toThrow('steps of 0.0013; use at least 0.9906');
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
    const budgets = [0.99, 0.9999, 1, 1.01, 3.33, 10, 25.5, 99.99, 250, 1000];

    for (let index = 1n; index < ticks; index += stride) {
      const price = (index * tick) as ScaledPrice;
      for (const budget of budgets) {
        const scaledBudget = BigInt(Math.round(budget * 1_000_000));
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

        if (expected < 990_000n) {
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

  it('rounds a BUY amount down to the amount precision before calculating amounts', () => {
    // 12.34999 rounds down to 12.3499, then steps down to 12.3469 for 33.37 shares.
    expect(
      computeMarketOrderAmounts({
        amount: 12.34999,
        price: toScaledPrice(0.37),
        side: OrderSide.BUY,
        tickSize: 0.01,
      }),
    ).toEqual({
      offeredAmount: 12_346_900n,
      requestedAmount: 33_370_000n,
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
  expect(amounts.offeredAmount % 10n ** BigInt(6 - config.amount)).toBe(0n);
  expect(amounts.requestedAmount % 10n ** BigInt(6 - config.amount)).toBe(0n);
}

// Largest collateral within the budget that buys a whole number of share units
// at exactly the price, with collateral in whole units too. Walks the share
// count down one unit at a time from the most the budget could buy.
function exactBuyCollateralBySearch(
  budget: bigint,
  price: ScaledPrice,
  tickSize: TickSizeValue,
): bigint {
  const unit = 10n ** BigInt(6 - resolveRoundingConfig(tickSize).amount);
  for (
    let shares = ((budget * FIXED_SCALE) / price / unit) * unit;
    shares > 0n;
    shares -= unit
  ) {
    const scaled = shares * price;
    const collateral = scaled / FIXED_SCALE;
    if (
      scaled % FIXED_SCALE === 0n &&
      collateral % unit === 0n &&
      collateral <= budget
    ) {
      return collateral;
    }
  }
  return 0n;
}
