import { describe, expect, it } from 'vitest';
import {
  PerpsAccountFillSchema,
  PerpsCancelOrderResultSchema,
  PerpsOrderSchema,
  PerpsOrderStatus,
  PerpsPostOrderAckSchema,
} from './orders';

const baseFill = {
  trade_id: 1,
  order_id: 2,
  instrument_id: 6,
  side: 'long',
  price: '1',
  quantity: '2',
  taker: true,
  fee: '0.01',
  fee_asset: 'USDC',
  previous_size: '0',
  previous_entry_price: '0',
  pnl: '0',
  liquidation: false,
  timestamp: 1_700_000_000_000,
};

describe('PerpsAccountFillSchema', () => {
  it('normalizes placeholder hashes to undefined', () => {
    const fill = PerpsAccountFillSchema.parse({
      ...baseFill,
      hash: '0x',
    });

    expect(fill.hash).toBeUndefined();
  });
});

describe('PerpsPostOrderAckSchema', () => {
  it('normalizes mixed post order acknowledgements', () => {
    const acks = [
      PerpsPostOrderAckSchema.parse({
        coid: '0123456789abcdef0123456789abcdef',
        oid: 123,
        status: 'ok',
      }),
      PerpsPostOrderAckSchema.parse({
        coid: 'fedcba9876543210fedcba9876543210',
        error: 'insufficient_margin',
        status: 'err',
      }),
    ];

    expect(acks).toEqual([
      {
        clientOrderId: '0123456789abcdef0123456789abcdef',
        orderId: 123,
        status: 'ok',
      },
      {
        clientOrderId: 'fedcba9876543210fedcba9876543210',
        error: 'insufficient_margin',
        status: 'err',
      },
    ]);
  });

  it('requires order id for accepted post order acknowledgements', () => {
    expect(() => PerpsPostOrderAckSchema.parse({ status: 'ok' })).toThrow();
  });
});

describe('PerpsOrderSchema', () => {
  it('normalizes typed order statuses', () => {
    const order = PerpsOrderSchema.parse({
      buy: true,
      created_timestamp: 1_700_000_000_000,
      filled_quantity: '1',
      instrument_id: 1,
      order_id: 123,
      post_only: false,
      price: '100',
      quantity: '2',
      resting_quantity: '1',
      status: 'partial',
      tif: 'gtc',
      updated_timestamp: 1_700_000_000_000,
    });

    expect(order.id).toBe(123);
    expect(order.status).toBe(PerpsOrderStatus.Partial);
  });
});

describe('PerpsCancelOrderResultSchema', () => {
  it('normalizes cancel order result identifiers', () => {
    const result = PerpsCancelOrderResultSchema.parse({
      coid: '0123456789abcdef0123456789abcdef',
      oid: 123,
      status: 'ok',
    });

    expect(result).toEqual({
      clientOrderId: '0123456789abcdef0123456789abcdef',
      orderId: 123,
      status: 'ok',
    });
  });

  it('allows accepted cancel order results without an order id', () => {
    const result = PerpsCancelOrderResultSchema.parse({ status: 'ok' });

    expect(result.status).toBe('ok');
    expect(result.orderId).toBeUndefined();
  });
});
