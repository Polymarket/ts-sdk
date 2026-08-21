import type { TickSizeValue } from '@polymarket/bindings';
import { describe, expect, it } from 'vitest';
import { UserInputError } from '../../errors';
import { resolveRoundingConfig, validatePriceOnTickGrid } from './context';
import { FIXED_SCALE, MAX_PRICE_DRIFT } from './fixed';

describe('resolveRoundingConfig', () => {
  it('supports all current tick sizes', () => {
    expect(resolveRoundingConfig(0.1)).toEqual({
      amount: 3,
      size: 2,
    });
    expect(resolveRoundingConfig(0.01)).toEqual({
      amount: 4,
      size: 2,
    });
    expect(resolveRoundingConfig(0.005)).toEqual({
      amount: 5,
      size: 2,
    });
    expect(resolveRoundingConfig(0.0025)).toEqual({
      amount: 6,
      size: 2,
    });
    expect(resolveRoundingConfig(0.001)).toEqual({
      amount: 5,
      size: 2,
    });
    expect(resolveRoundingConfig(0.0001)).toEqual({
      amount: 6,
      size: 2,
    });
  });
});

// Prices are generated as integer numerators over the tick's scale, which
// yields the exact float a user would get from typing the decimal literal.
const ALL_TICKS: TickSizeValue[] = [0.1, 0.01, 0.005, 0.0025, 0.001, 0.0001];

function grid(tick: TickSizeValue): { scale: number; step: number } {
  switch (tick) {
    case 0.1:
      return { scale: 10, step: 1 };
    case 0.01:
      return { scale: 100, step: 1 };
    case 0.005:
      return { scale: 1_000, step: 5 };
    case 0.0025:
      return { scale: 10_000, step: 25 };
    case 0.001:
      return { scale: 1_000, step: 1 };
    case 0.0001:
      return { scale: 10_000, step: 1 };
  }
}

describe('validatePriceOnTickGrid', () => {
  it('accepts every on-grid price in range and returns it scaled', () => {
    for (const tick of ALL_TICKS) {
      const { scale, step } = grid(tick);

      for (let k = step; k <= scale - step; k += step) {
        expect(validatePriceOnTickGrid(k / scale, tick)).toBe(
          (BigInt(k) * FIXED_SCALE) / BigInt(scale),
        );
      }
    }
  });

  it('rejects every off-grid price at tick precision on the half-step ticks', () => {
    for (const tick of [0.005, 0.0025] satisfies TickSizeValue[]) {
      const { scale, step } = grid(tick);

      for (let k = step; k <= scale - step; k += 1) {
        if (k % step !== 0) {
          expect(
            () => validatePriceOnTickGrid(k / scale, tick),
            `price ${k / scale} on tick ${tick}`,
          ).toThrow('must be a multiple of tick size');
        }
      }
    }
  });

  it.each([
    [0.15, 0.1],
    [0.555, 0.01],
    [0.0125, 0.005],
    [0.00255, 0.0025],
    [0.5555, 0.001],
    [0.55555, 0.0001],
    [0.555001, 0.01],
  ] as [
    number,
    TickSizeValue,
  ][])('rejects representable price %s that is off-grid for tick %s', (price, tick) => {
    expect(() => validatePriceOnTickGrid(price, tick)).toThrow(
      'must be a multiple of tick size',
    );
  });

  it.each([
    [0.0100001, 0.005],
    [0.60000000001, 0.1],
    [0.00250000001, 0.0025],
  ] as [
    number,
    TickSizeValue,
  ][])('rejects price %s instead of snapping it onto tick %s', (price, tick) => {
    expect(() => validatePriceOnTickGrid(price, tick)).toThrow(
      'unsupported precision',
    );
  });

  it.each([
    [0.4 + 0.2, 0.1, 600_000n],
    [(0.2 + 0.4) / 2, 0.1, 300_000n],
    [1 - 0.9999, 0.0001, 100n],
  ] as [
    number,
    TickSizeValue,
    bigint,
  ][])('snaps arithmetic noise in %s for tick %s', (price, tick, expected) => {
    expect(validatePriceOnTickGrid(price, tick)).toBe(expected);
  });

  it('accepts drift at the boundary and rejects one epsilon beyond it', () => {
    const price = 0.6;
    const atBoundary = price + MAX_PRICE_DRIFT;
    const beyondBoundary = atBoundary + Number.EPSILON;

    expect(validatePriceOnTickGrid(atBoundary, 0.1)).toBe(600_000n);
    expect(() => validatePriceOnTickGrid(beyondBoundary, 0.1)).toThrow(
      'unsupported precision',
    );
  });

  it('rejects prices outside [tick, 1 - tick]', () => {
    for (const tick of ALL_TICKS) {
      for (const price of [0, 1, 1.5, -tick, tick / 2]) {
        expect(() => validatePriceOnTickGrid(price, tick)).toThrow(
          UserInputError,
        );
        expect(() => validatePriceOnTickGrid(price, tick)).toThrow(
          'must be between',
        );
      }
    }
  });
});
