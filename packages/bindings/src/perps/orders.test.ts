import { describe, expect, it } from 'vitest';
import {
  RawPerpsAccountFillSchema,
  RawPerpsCancelOrderAckSchema,
  RawPerpsPlaceOrderAckSchema,
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

describe('RawPerpsAccountFillSchema', () => {
  it('normalizes placeholder hashes to undefined', () => {
    const fill = RawPerpsAccountFillSchema.parse({
      ...baseFill,
      hash: '0x',
    });

    expect(fill.hash).toBeUndefined();
  });
});

describe('RawPerpsPlaceOrderAckSchema', () => {
  it('normalizes mixed place order acknowledgements', () => {
    const acks = [
      RawPerpsPlaceOrderAckSchema.parse({
        coid: '0123456789abcdef0123456789abcdef',
        oid: 123,
        status: 'ok',
      }),
      RawPerpsPlaceOrderAckSchema.parse({
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

  it('requires order id for accepted place order acknowledgements', () => {
    expect(() => RawPerpsPlaceOrderAckSchema.parse({ status: 'ok' })).toThrow();
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
});
