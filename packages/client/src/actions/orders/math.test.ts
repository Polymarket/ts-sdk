import { describe, expect, it } from 'vitest';
import { decimalPlaces, isMultipleOf } from './math';

describe('isMultipleOf', () => {
  it.each([
    [0.015, 0.005],
    [0.005, 0.005],
    [0.995, 0.005],
    [0.01, 0.005],
    [0.0075, 0.0025],
    [0.9975, 0.0025],
    [0.55, 0.01],
  ])('returns true for %s on a %s step', (value, step) => {
    expect(isMultipleOf(value, step)).toBe(true);
  });

  it.each([
    [0.007, 0.005],
    [0.013, 0.005],
    [0.0033, 0.0025],
    [0.0077, 0.0025],
    // More decimals than the step: never a multiple, even when integer
    // scaling at the step's precision would round onto the grid.
    [0.555001, 0.01],
    [0.0100001, 0.005],
  ])('returns false for %s off a %s step', (value, step) => {
    expect(isMultipleOf(value, step)).toBe(false);
  });
});

describe('decimalPlaces', () => {
  it.each([
    [1, 0],
    [1.2, 1],
    [1.23, 2],
    ['1.23', 2],
    [0.000001, 6],
    ['0.000001', 6],
  ])('counts ordinary decimal places for %s', (value, expected) => {
    expect(decimalPlaces(value)).toBe(expected);
  });

  it.each([
    [1e-7, 7],
    ['1e-7', 7],
    [1.23e-7, 9],
    ['1.23E-7', 9],
    [1.234e-7, 10],
  ])('counts negative scientific notation decimal places for %s', (value, expected) => {
    expect(decimalPlaces(value)).toBe(expected);
  });

  it.each([
    [1e3, 0],
    ['1e+3', 0],
    [1.23e3, 0],
    [1.23e1, 1],
    ['1.23e+1', 1],
    [1.234e2, 1],
  ])('counts positive scientific notation decimal places for %s', (value, expected) => {
    expect(decimalPlaces(value)).toBe(expected);
  });
});
