import { OrderSide, type TickSizeValue } from '@polymarket/bindings';
import { describe, expect, it } from 'vitest';
import { computeLimitOrderAmounts, computeMarketOrderAmounts } from './amounts';

const INPUT_AMOUNT = 12.34;
const SCALED_INPUT_AMOUNT = 12_340_000n;

const TICK_CASES = [
  {
    limitProduct: 3_702_000n,
    marketBuyDown: 41_133_000n,
    marketBuyUp: 41_134_000n,
    price: 0.3,
    tickSize: 0.1,
  },
  {
    limitProduct: 4_565_800n,
    marketBuyDown: 33_351_300n,
    marketBuyUp: 33_351_400n,
    price: 0.37,
    tickSize: 0.01,
  },
  {
    limitProduct: 4_627_500n,
    marketBuyDown: 32_906_660n,
    marketBuyUp: 32_906_670n,
    price: 0.375,
    tickSize: 0.005,
  },
  {
    limitProduct: 4_596_650n,
    marketBuyDown: 33_127_516n,
    marketBuyUp: 33_127_517n,
    price: 0.3725,
    tickSize: 0.0025,
  },
  {
    limitProduct: 4_602_820n,
    marketBuyDown: 33_083_100n,
    marketBuyUp: 33_083_110n,
    price: 0.373,
    tickSize: 0.001,
  },
  {
    limitProduct: 4_601_586n,
    marketBuyDown: 33_091_981n,
    marketBuyUp: 33_091_982n,
    price: 0.3729,
    tickSize: 0.0001,
  },
] satisfies {
  limitProduct: bigint;
  marketBuyDown: bigint;
  marketBuyUp: bigint;
  price: number;
  tickSize: TickSizeValue;
}[];

describe('computeLimitOrderAmounts', () => {
  it.each(TICK_CASES)('encodes BUY amounts at tick size $tickSize', ({
    limitProduct,
    price,
    tickSize,
  }) => {
    expect(
      computeLimitOrderAmounts({
        price,
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
    price,
    tickSize,
  }) => {
    expect(
      computeLimitOrderAmounts({
        price,
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
        price: 0.37,
        side: OrderSide.BUY,
        size: 12.349,
        tickSize: 0.01,
      }),
    ).toEqual({
      offeredAmount: 4_565_800n,
      requestedAmount: SCALED_INPUT_AMOUNT,
    });
  });
});

describe('computeMarketOrderAmounts', () => {
  it.each(
    TICK_CASES,
  )('rounds an unprotected BUY down at tick size $tickSize', ({
    marketBuyDown,
    price,
    tickSize,
  }) => {
    expect(
      computeMarketOrderAmounts({
        amount: INPUT_AMOUNT,
        price,
        side: OrderSide.BUY,
        tickSize,
      }),
    ).toEqual({
      offeredAmount: SCALED_INPUT_AMOUNT,
      requestedAmount: marketBuyDown,
    });
  });

  it.each(TICK_CASES)('rounds a protected BUY up at tick size $tickSize', ({
    marketBuyUp,
    price,
    tickSize,
  }) => {
    expect(
      computeMarketOrderAmounts({
        amount: INPUT_AMOUNT,
        price,
        protectPrice: true,
        side: OrderSide.BUY,
        tickSize,
      }),
    ).toEqual({
      offeredAmount: SCALED_INPUT_AMOUNT,
      requestedAmount: marketBuyUp,
    });
  });

  it.each(
    TICK_CASES,
  )('keeps exact SELL proceeds unchanged by protection at tick size $tickSize', ({
    limitProduct,
    price,
    tickSize,
  }) => {
    for (const protectPrice of [false, true]) {
      expect(
        computeMarketOrderAmounts({
          amount: INPUT_AMOUNT,
          price,
          protectPrice,
          side: OrderSide.SELL,
          tickSize,
        }),
      ).toEqual({
        offeredAmount: SCALED_INPUT_AMOUNT,
        requestedAmount: limitProduct,
      });
    }
  });

  it('rounds the public amount down to two decimals before calculating amounts', () => {
    expect(
      computeMarketOrderAmounts({
        amount: 12.349,
        price: 0.37,
        protectPrice: true,
        side: OrderSide.BUY,
        tickSize: 0.01,
      }),
    ).toEqual({
      offeredAmount: SCALED_INPUT_AMOUNT,
      requestedAmount: 33_351_400n,
    });
  });

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
