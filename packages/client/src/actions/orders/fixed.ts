import { invariant } from '@polymarket/types';
import { UserInputError } from '../../errors';

declare const SCALED_AMOUNT_BRAND: unique symbol;
declare const SCALED_PRICE_BRAND: unique symbol;

export const FIXED_DECIMALS = 6;
export const FIXED_SCALE = 1_000_000n;
export const MAX_PRICE_DRIFT = 8 * Number.EPSILON;

export type ScaledAmount = bigint & {
  readonly [SCALED_AMOUNT_BRAND]: true;
};

export type ScaledPrice = bigint & {
  readonly [SCALED_PRICE_BRAND]: true;
};

export enum Rounding {
  Down = 'down',
  Up = 'up',
}

export function toScaledAmount(value: number): ScaledAmount {
  return BigInt(Math.trunc(value * Number(FIXED_SCALE))) as ScaledAmount;
}

export function toScaledPrice(value: number): ScaledPrice {
  const candidate = Math.round(value * Number(FIXED_SCALE));
  const canonical = candidate / Number(FIXED_SCALE);

  if (
    !Number.isSafeInteger(candidate) ||
    Math.abs(value - canonical) > MAX_PRICE_DRIFT
  ) {
    throw new UserInputError('has unsupported precision.');
  }

  return BigInt(candidate) as ScaledPrice;
}

export function fromScaledPrice(value: ScaledPrice): number {
  return Number(value) / Number(FIXED_SCALE);
}

export function scaledQuantum(decimalPlaces: number): bigint {
  invariant(
    Number.isInteger(decimalPlaces) &&
      decimalPlaces >= 0 &&
      decimalPlaces <= FIXED_DECIMALS,
    `Decimal places must be an integer between 0 and ${FIXED_DECIMALS}.`,
  );

  return 10n ** BigInt(FIXED_DECIMALS - decimalPlaces);
}

export function mulDiv<T extends bigint>(
  value: T,
  multiplier: bigint,
  denominator: bigint,
  rounding: Rounding,
): T {
  invariant(value >= 0n, 'Value must be non-negative.');
  invariant(multiplier >= 0n, 'Multiplier must be non-negative.');
  invariant(denominator > 0n, 'Denominator must be positive.');

  const numerator = value * multiplier;
  const quotient = numerator / denominator;

  if (rounding === Rounding.Up && numerator % denominator !== 0n) {
    return (quotient + 1n) as T;
  }

  return quotient as T;
}

export function quantize<T extends bigint>(
  value: T,
  decimalPlaces: number,
  rounding: Rounding,
): T {
  const quantum = scaledQuantum(decimalPlaces);
  return (mulDiv(value, 1n, quantum, rounding) * quantum) as T;
}
