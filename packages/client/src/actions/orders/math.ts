const COLLATERAL_TOKEN_DECIMALS = 6;

export function parseAmount(value: number): bigint {
  return BigInt(Math.round(value * 10 ** COLLATERAL_TOKEN_DECIMALS));
}

export function roundDown(value: number, decimals: number): number {
  if (decimalPlaces(value) <= decimals) {
    return value;
  }

  return Math.floor(value * 10 ** decimals) / 10 ** decimals;
}

export function roundUp(value: number, decimals: number): number {
  if (decimalPlaces(value) <= decimals) {
    return value;
  }

  return Math.ceil(value * 10 ** decimals) / 10 ** decimals;
}

export function roundNormal(value: number, decimals: number): number {
  if (decimalPlaces(value) <= decimals) {
    return value;
  }

  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}

/**
 * Returns whether `value` is an integer multiple of `step`, comparing both as
 * integers scaled by `10 ** decimals` to avoid floating-point modulo errors.
 * `value` and `step` must have at most `decimals` decimal places.
 */
export function isMultipleOf(
  value: number,
  step: number,
  decimals: number,
): boolean {
  const scale = 10 ** decimals;
  return Math.round(value * scale) % Math.round(step * scale) === 0;
}

export function decimalPlaces(value: number | string): number {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return 0;
  }

  const [mantissa = '', exponent] = value.toString().toLowerCase().split('e');
  const [, fractionalPart = ''] = mantissa.split('.');
  const fractionalPlaces = fractionalPart.length;

  if (exponent === undefined) {
    return fractionalPlaces;
  }

  const exponentValue = Number.parseInt(exponent, 10);

  return Math.max(0, fractionalPlaces - exponentValue);
}
