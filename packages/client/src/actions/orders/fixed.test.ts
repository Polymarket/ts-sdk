import { describe, expect, it } from 'vitest';
import {
  mulDiv,
  quantize,
  Rounding,
  scaledQuantum,
  toScaledAmount,
  toScaledPrice,
} from './fixed';

describe('fixed-point conversion', () => {
  it('normalizes amounts and prices to six-decimal integers', () => {
    expect(toScaledAmount(12.34)).toBe(12_340_000n);
    expect(toScaledPrice(0.3725)).toBe(372_500n);
  });

  it('truncates precision beyond the six-decimal boundary', () => {
    expect(toScaledAmount(12.340000000001)).toBe(12_340_000n);
    expect(toScaledAmount(12.3499999)).toBe(12_349_999n);
  });
});

describe('scaledQuantum', () => {
  it.each([
    [0, 1_000_000n],
    [2, 10_000n],
    [3, 1_000n],
    [4, 100n],
    [5, 10n],
    [6, 1n],
  ])('returns the six-decimal quantum for %i decimal places', (decimalPlaces, expected) => {
    expect(scaledQuantum(decimalPlaces)).toBe(expected);
  });
});

describe('mulDiv', () => {
  it('rounds a remainder down', () => {
    expect(mulDiv(10n, 10n, 3n, Rounding.Down)).toBe(33n);
  });

  it('rounds a remainder up', () => {
    expect(mulDiv(10n, 10n, 3n, Rounding.Up)).toBe(34n);
  });

  it('does not add a unit when upward division is exact', () => {
    expect(mulDiv(9_990_000n, 100_000n, 1_000_000n, Rounding.Up)).toBe(
      999_000n,
    );
  });
});

describe('quantize', () => {
  it('rounds to the requested decimal quantum', () => {
    expect(quantize(12_349_999n, 2, Rounding.Down)).toBe(12_340_000n);
    expect(quantize(12_340_001n, 2, Rounding.Up)).toBe(12_350_000n);
  });

  it('leaves an exact quantum unchanged when rounding up', () => {
    expect(quantize(12_340_000n, 2, Rounding.Up)).toBe(12_340_000n);
  });
});
