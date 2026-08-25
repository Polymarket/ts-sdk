import { OrderSide } from '@polymarket/bindings';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validatePriceOnTickGrid } from './context';
import { PrepareLimitOrderParamsSchema } from './limit';

describe('PrepareLimitOrderParamsSchema', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a GTD expiration exactly 3 minutes in the future', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    expect(
      PrepareLimitOrderParamsSchema.safeParse({
        expiration: Math.floor(Date.now() / 1000) + 180,
        price: 0.52,
        side: OrderSide.BUY,
        size: 10,
        tokenId: '123',
      }).success,
    ).toBe(true);
  });

  it('rejects a GTD expiration less than 3 minutes in the future', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    expect(
      PrepareLimitOrderParamsSchema.safeParse({
        expiration: Math.floor(Date.now() / 1000) + 179,
        price: 0.52,
        side: OrderSide.BUY,
        size: 10,
        tokenId: '123',
      }).success,
    ).toBe(false);
  });

  it.each([
    [0.4 + 0.2, 0.1, 600_000n],
    [String(0.4 + 0.2), 0.1, 600_000n],
    [1 - 0.9999, 0.0001, 100n],
    [String(1 - 0.9999), 0.0001, 100n],
  ] as [
    number | string,
    0.1 | 0.0001,
    bigint,
  ][])('normalizes equivalent numeric and string prices before grid validation', (price, tickSize, expected) => {
    const params = PrepareLimitOrderParamsSchema.parse({
      price,
      side: OrderSide.BUY,
      size: 10,
      tokenId: '123',
    });

    expect(validatePriceOnTickGrid(params.price, tickSize)).toBe(expected);
  });
});
