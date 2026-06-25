import { describe, expect, it } from 'vitest';
import {
  PerpsAccountFillSchema,
  PerpsOrderSchema,
  PerpsOrderStatus,
  RawPerpsCancelOrderAckSchema,
  RawPerpsPostOrderAckSchema,
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

describe('RawPerpsPostOrderAckSchema', () => {
  it('normalizes mixed post order acknowledgements', () => {
    const acks = [
      RawPerpsPostOrderAckSchema.parse({
        coid: '0123456789abcdef0123456789abcdef',
        oid: 123,
        status: 'ok',
      }),
      RawPerpsPostOrderAckSchema.parse({
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
    expect(() => RawPerpsPostOrderAckSchema.parse({ status: 'ok' })).toThrow();
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

describe('RawPerpsCancelOrderAckSchema', () => {
  it('normalizes cancel order acknowledgement identifiers', () => {
    const ack = RawPerpsCancelOrderAckSchema.parse({
      coid: '0123456789abcdef0123456789abcdef',
      oid: 123,
      status: 'ok',
    });

    expect(ack).toEqual({
      clientOrderId: '0123456789abcdef0123456789abcdef',
      orderId: 123,
      status: 'ok',
    });
  });

  it('allows accepted cancel order acknowledgements without an order id', () => {
    const ack = RawPerpsCancelOrderAckSchema.parse({ status: 'ok' });

    expect(ack.status).toBe('ok');
    expect(ack.orderId).toBeUndefined();
  });
});
