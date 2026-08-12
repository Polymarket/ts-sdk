import type { TickSizeValue } from '@polymarket/bindings';
import { describe, expect, it } from 'vitest';
import { UserInputError } from '../../errors';
import { resolveRoundingConfig, validatePriceOnTickGrid } from './context';
import { decimalPlaces } from './math';

describe('resolveRoundingConfig', () => {
  it('supports all current tick sizes', () => {
    expect(resolveRoundingConfig(0.1)).toEqual({
      amount: 3,
      price: 1,
      size: 2,
    });
    expect(resolveRoundingConfig(0.01)).toEqual({
      amount: 4,
      price: 2,
      size: 2,
    });
    expect(resolveRoundingConfig(0.005)).toEqual({
      amount: 5,
      price: 3,
      size: 2,
    });
    expect(resolveRoundingConfig(0.0025)).toEqual({
      amount: 6,
      price: 4,
      size: 2,
    });
    expect(resolveRoundingConfig(0.001)).toEqual({
      amount: 5,
      price: 3,
      size: 2,
    });
    expect(resolveRoundingConfig(0.0001)).toEqual({
      amount: 6,
      price: 4,
      size: 2,
    });
  });
});

// Prices are generated as integer numerators over the tick's scale, which
// yields the exact float a user would get from typing the decimal literal.
const ALL_TICKS: TickSizeValue[] = [0.1, 0.01, 0.005, 0.0025, 0.001, 0.0001];

function grid(tick: TickSizeValue): { scale: number; step: number } {
  const scale = 10 ** decimalPlaces(tick);
  return { scale, step: Math.round(tick * scale) };
}

describe('validatePriceOnTickGrid', () => {
  it('accepts every on-grid price in range and returns it unchanged', () => {
    for (const tick of ALL_TICKS) {
      const { scale, step } = grid(tick);

      for (let k = step; k <= scale - step; k += step) {
        expect(validatePriceOnTickGrid(k / scale, tick)).toBe(k / scale);
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
    // Values an integer-scaling grid check would silently snap onto the grid
    // without the decimal-count guard.
    [0.555001, 0.01],
    [0.0100001, 0.005],
    [0.55000000001, 0.1],
    [0.00250000001, 0.0025],
  ] as [
    number,
    TickSizeValue,
  ][])('rejects %s for exceeding the %s tick precision', (price, tick) => {
    expect(() => validatePriceOnTickGrid(price, tick)).toThrow(
      'decimal places',
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
