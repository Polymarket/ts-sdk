import { describe, expect, it } from 'vitest';
import { ClobTradeSchema, type OpenOrder, OpenOrderSchema } from './account';

const baseTrade = {
  asset_id: '1',
  bucket_index: 7,
  fee_rate_bps: '0',
  id: 'trade-1',
  maker_address: `0x${'aa'.repeat(20)}`,
  maker_orders: [
    {
      asset_id: '1',
      fee_rate_bps: '0',
      maker_address: `0x${'bb'.repeat(20)}`,
      matched_amount: '1.5',
      order_id: 'order-1',
      outcome: 'Yes',
      owner: 'owner-1',
      price: '0.5',
      side: 'BUY',
    },
  ],
  market: `0x${'cc'.repeat(32)}`,
  outcome: 'Yes',
  owner: 'owner-1',
  price: '0.5',
  side: 'BUY',
  size: '1.5',
  status: 'CONFIRMED',
  taker_order_id: 'order-2',
  trader_side: 'TAKER',
  transaction_hash: `0x${'dd'.repeat(32)}`,
};

describe('ClobTradeSchema', () => {
  it('normalizes legacy epoch seconds timestamp strings', () => {
    const trade = ClobTradeSchema.parse({
      ...baseTrade,
      match_time: '1777996829',
      last_update: '1777996840',
    });

    expect(trade.makerOrders[0]?.tokenId).toBe('1');
    expect(trade.conditionId).toBe(baseTrade.market);
    expect(trade).not.toHaveProperty('market');
    expect(trade.matchedAt).toBe('2026-05-05T16:00:29.000Z');
    expect(trade.updatedAt).toBe('2026-05-05T16:00:40.000Z');
  });

  it('normalizes empty maker fee_rate_bps to null', () => {
    const trade = ClobTradeSchema.parse({
      ...baseTrade,
      maker_orders: [
        { ...baseTrade.maker_orders[0], fee_rate_bps: '' },
        { ...baseTrade.maker_orders[0], fee_rate_bps: '25' },
      ],
      match_time: '1777996829',
      last_update: '1777996840',
    });

    expect(trade.makerOrders[0]?.feeRateBps).toBeNull();
    expect(trade.makerOrders[1]?.feeRateBps).toBe('25');
  });
});

const baseOpenOrder = {
  asset_id: '8501497',
  associate_trades: [],
  created_at: 1700000000,
  expiration: '0',
  id: 'order-1',
  maker_address: `0x${'1'.repeat(40)}`,
  market: `0x${'1'.repeat(64)}`,
  order_type: 'GTC',
  original_size: '100',
  outcome: 'Yes',
  owner: `0x${'1'.repeat(40)}`,
  price: '0.5',
  side: 'BUY',
  size_matched: '0',
  status: 'LIVE',
};

describe('OpenOrderSchema', () => {
  it('normalizes epoch seconds timestamps', () => {
    const order: OpenOrder = OpenOrderSchema.parse({
      ...baseOpenOrder,
      expiration: '1735689600',
    });

    expect(order.createdAt).toBe('2023-11-14T22:13:20.000Z');
    expect(order.expiresAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('omits expiresAt for zero expiration', () => {
    const order: OpenOrder = OpenOrderSchema.parse(baseOpenOrder);

    expect(order.expiresAt).toBeUndefined();
    expect(order).not.toHaveProperty('expiresAt');
  });

  it('normalizes epoch milliseconds timestamps', () => {
    const order: OpenOrder = OpenOrderSchema.parse({
      ...baseOpenOrder,
      created_at: 1735689600000,
      expiration: '1735689600000',
    });

    expect(order.createdAt).toBe('2025-01-01T00:00:00.000Z');
    expect(order.expiresAt).toBe('2025-01-01T00:00:00.000Z');
  });
});
