import { OrderSide, type TickSizeValue } from '@polymarket/bindings';
import { UserInputError } from '../../errors';
import { type RoundingConfig, resolveRoundingConfig } from './context';
import {
  FIXED_SCALE,
  mulDiv,
  quantize,
  Rounding,
  type ScaledAmount,
  type ScaledPrice,
  scaledQuantum,
  toScaledAmount,
} from './fixed';

function multiplyAmountByPrice(
  amount: ScaledAmount,
  price: ScaledPrice,
  decimalPlaces: number,
  rounding: Rounding,
): bigint {
  const quantum = scaledQuantum(decimalPlaces);
  return mulDiv(amount, price, FIXED_SCALE * quantum, rounding) * quantum;
}

export function computeLimitOrderAmounts(params: {
  price: ScaledPrice;
  side: OrderSide;
  size: number;
  tickSize: TickSizeValue;
}): {
  offeredAmount: bigint;
  requestedAmount: bigint;
} {
  const roundConfig = resolveRoundingConfig(params.tickSize);
  const size = quantize(
    toScaledAmount(params.size),
    roundConfig.size,
    Rounding.Down,
  );

  if (params.side === OrderSide.BUY) {
    return {
      offeredAmount: multiplyAmountByPrice(
        size,
        params.price,
        roundConfig.amount,
        Rounding.Down,
      ),
      requestedAmount: size,
    };
  }

  return {
    offeredAmount: size,
    requestedAmount: multiplyAmountByPrice(
      size,
      params.price,
      roundConfig.amount,
      Rounding.Down,
    ),
  };
}

export function computeMarketOrderAmounts(params: {
  amount: number;
  price: ScaledPrice;
  side: OrderSide;
  tickSize: TickSizeValue;
}): {
  offeredAmount: bigint;
  requestedAmount: bigint;
} {
  const roundConfig = resolveRoundingConfig(params.tickSize);

  if (params.side === OrderSide.BUY) {
    return computeMarketBuyAmounts(
      quantize(
        toScaledAmount(params.amount),
        roundConfig.amount,
        Rounding.Down,
      ),
      params.price,
      roundConfig,
    );
  }

  const amount = quantize(
    toScaledAmount(params.amount),
    roundConfig.size,
    Rounding.Down,
  );

  return {
    offeredAmount: amount,
    requestedAmount: multiplyAmountByPrice(
      amount,
      params.price,
      roundConfig.amount,
      Rounding.Down,
    ),
  };
}

/**
 * Smallest collateral amount, in base units, that a marketable BUY may spend.
 * It is 0.99 USD, not 1 USD, because an exact-price spend of a 1 USD amount can
 * land just below 1 USD.
 */
const MIN_MARKET_BUY_AMOUNT = 990_000n;

function gcd(a: bigint, b: bigint): bigint {
  let x = a;
  let y = b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

function formatCollateral(amount: bigint): string {
  return String(Number(amount) / Number(FIXED_SCALE));
}

/**
 * Returns the largest collateral and share amounts within `amount` whose ratio
 * is exactly `price`, with collateral and shares both in whole `amount`
 * decimals of the rounding config (the precision of a limit BUY's collateral).
 *
 * The exchange reads the order price as collateral / shares, so the pair must
 * encode `price` exactly. Both amounts then move in fixed steps: the smallest
 * share amount that meets both precisions at this price.
 */
function computeMarketBuyAmounts(
  amount: ScaledAmount,
  price: ScaledPrice,
  roundConfig: RoundingConfig,
): {
  offeredAmount: bigint;
  requestedAmount: bigint;
} {
  const collateralUnit = scaledQuantum(roundConfig.amount);
  const shareUnit = scaledQuantum(roundConfig.amount);
  // collateral = shares * price / FIXED_SCALE must be a whole number of
  // collateral units.
  const collateralStepDivisor = FIXED_SCALE * collateralUnit;
  const minimumShares =
    collateralStepDivisor / gcd(collateralStepDivisor, price);
  const shareStep = (minimumShares / gcd(minimumShares, shareUnit)) * shareUnit;
  const collateralStep = (shareStep * price) / FIXED_SCALE;
  const steps = amount / collateralStep;
  const collateral = steps * collateralStep;

  if (collateral < MIN_MARKET_BUY_AMOUNT) {
    const minimumSteps =
      (MIN_MARKET_BUY_AMOUNT + collateralStep - 1n) / collateralStep;
    throw new UserInputError(
      `BUY amount ${formatCollateral(amount)} cannot be spent exactly at price ${formatCollateral(price)}. At this price the amount is used in steps of ${formatCollateral(collateralStep)}; use at least ${formatCollateral(minimumSteps * collateralStep)}.`,
    );
  }

  return {
    offeredAmount: collateral,
    requestedAmount: steps * shareStep,
  };
}
