import { describe, expect, it } from 'vitest';
import { resolveRoundingConfig } from './context';

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
