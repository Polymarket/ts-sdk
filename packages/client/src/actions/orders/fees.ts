import { invariant } from '@polymarket/types';
import {
  FIXED_SCALE,
  mulDiv,
  Rounding,
  type ScaledAmount,
  type ScaledPrice,
  scaledQuantum,
  toScaledAmount,
} from './fixed';

const FEE_DECIMALS = 5;

export type ExactRatio = Readonly<{
  numerator: bigint;
  denominator: bigint;
}>;

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;

  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a;
}

function exactRatio(numerator: bigint, denominator: bigint): ExactRatio {
  invariant(numerator >= 0n, 'Ratio numerator must be non-negative.');
  invariant(denominator > 0n, 'Ratio denominator must be positive.');

  if (numerator === 0n) {
    return { numerator: 0n, denominator: 1n };
  }

  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
}

function exactRatioFromNumber(value: number): ExactRatio {
  invariant(
    Number.isFinite(value) && value >= 0,
    'Ratio value must be a non-negative finite number.',
  );

  const [coefficient = '0', exponentText = '0'] = value.toString().split('e');
  const exponent = Number(exponentText);
  const [whole, fraction = ''] = coefficient.split('.');
  const digits = `${whole}${fraction}`;
  const decimalPlaces = fraction.length - exponent;

  if (decimalPlaces <= 0) {
    return exactRatio(BigInt(digits) * 10n ** BigInt(-decimalPlaces), 1n);
  }

  return exactRatio(BigInt(digits), 10n ** BigInt(decimalPlaces));
}

function multiplyRatios(left: ExactRatio, right: ExactRatio): ExactRatio {
  return exactRatio(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function powRatio(value: ExactRatio, exponent: number): ExactRatio {
  const magnitude = BigInt(Math.abs(exponent));

  if (exponent < 0) {
    invariant(value.numerator > 0n, 'Cannot raise zero to a negative power.');
    return exactRatio(
      value.denominator ** magnitude,
      value.numerator ** magnitude,
    );
  }

  return exactRatio(
    value.numerator ** magnitude,
    value.denominator ** magnitude,
  );
}

function approximateFractionalPlatformFeeRateFactor(
  price: ScaledPrice,
  rate: number,
  exponent: number,
): ExactRatio {
  const priceNumber = Number(price) / Number(FIXED_SCALE);
  const factor = rate * (priceNumber * (1 - priceNumber)) ** exponent;

  // The backend uses shopspring/decimal's Ln/ExpTaylor path for fractional
  // powers. There is no established cross-runtime error bound against
  // Math.pow, so this remains an isolated compatibility fallback. Converting
  // its result here ensures all fee-base math and final rounding stay integer.
  return exactRatioFromNumber(factor);
}

export function platformFeeRateFactor(
  price: ScaledPrice,
  rate: number,
  exponent: number,
): ExactRatio {
  invariant(
    price > 0n && price < FIXED_SCALE,
    'Fee price must be between zero and one.',
  );
  invariant(
    Number.isFinite(rate) && rate >= 0,
    'Fee rate must be a non-negative finite number.',
  );
  invariant(Number.isFinite(exponent), 'Fee exponent must be finite.');

  if (!Number.isSafeInteger(exponent)) {
    return approximateFractionalPlatformFeeRateFactor(price, rate, exponent);
  }

  const priceRatio = exactRatio(price, FIXED_SCALE);
  const complementRatio = exactRatio(FIXED_SCALE - price, FIXED_SCALE);
  const base = multiplyRatios(priceRatio, complementRatio);

  return multiplyRatios(exactRatioFromNumber(rate), powRatio(base, exponent));
}

export function platformFeeAmount(
  feeBase: ScaledAmount,
  factor: ExactRatio,
  rounding: Rounding,
): ScaledAmount {
  const quantum = scaledQuantum(FEE_DECIMALS);
  return (mulDiv(
    feeBase,
    factor.numerator,
    factor.denominator * quantum,
    rounding,
  ) * quantum) as ScaledAmount;
}

function platformFeePerBuyAmountFactor(
  price: ScaledPrice,
  rate: number,
  exponent: number,
): ExactRatio {
  return multiplyRatios(platformFeeRateFactor(price, rate, exponent), {
    numerator: FIXED_SCALE,
    denominator: price,
  });
}

function totalBuySpend(
  amount: ScaledAmount,
  platformFactor: ExactRatio,
  builderFactor: ExactRatio,
): bigint {
  const platformFee = platformFeeAmount(amount, platformFactor, Rounding.Up);
  const builderFee = platformFeeAmount(amount, builderFactor, Rounding.Up);

  return amount + platformFee + builderFee;
}

export function adjustBuyAmountForFees(params: {
  amount: number;
  price: ScaledPrice;
  maxSpend: number;
  platformFeeRate: number;
  platformFeeExponent: number;
  builderTakerFeeRate: number;
}): ScaledAmount {
  const amount = toScaledAmount(params.amount);
  const maxSpend = toScaledAmount(params.maxSpend);
  const platformFactor = platformFeePerBuyAmountFactor(
    params.price,
    params.platformFeeRate,
    params.platformFeeExponent,
  );
  const builderFactor = exactRatioFromNumber(params.builderTakerFeeRate);

  if (totalBuySpend(amount, platformFactor, builderFactor) <= maxSpend) {
    return amount;
  }

  let lower = 0n;
  let upper: bigint = amount < maxSpend ? amount : maxSpend;

  while (lower < upper) {
    const candidate = (lower + upper + 1n) / 2n;
    const candidateAmount = candidate as ScaledAmount;

    if (
      totalBuySpend(candidateAmount, platformFactor, builderFactor) <= maxSpend
    ) {
      lower = candidate;
    } else {
      upper = candidate - 1n;
    }
  }

  return lower as ScaledAmount;
}
