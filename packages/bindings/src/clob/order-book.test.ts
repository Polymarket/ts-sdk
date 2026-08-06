import { describe, expect, it } from 'vitest';
import { OrderBookSchema } from './order-book';

const orderBook = {
  market: `0x${'ab'.repeat(32)}`,
  asset_id: '111',
  bids: [],
  asks: [],
  min_order_size: '5',
  tick_size: '0.01',
  neg_risk: false,
  hash: 'a'.repeat(40),
};

describe('OrderBookSchema', () => {
  it('normalizes tick size to a supported numeric value', () => {
    expect(OrderBookSchema.parse(orderBook).tickSize).toBe(0.01);
  });

  it('rejects unsupported tick sizes', () => {
    expect(() =>
      OrderBookSchema.parse({ ...orderBook, tick_size: '0.02' }),
    ).toThrow();
  });
});
