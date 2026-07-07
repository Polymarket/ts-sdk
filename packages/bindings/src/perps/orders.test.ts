import { describe, expect, it } from 'vitest';
import {
  PerpsAccountFillSchema,
  PerpsCancelOrderResultSchema,
  PerpsOrderSchema,
  PerpsOrderUpdateSchema,
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
  it('normalizes order status and side', () => {
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
      ro: true,
      status: 'partial',
      tif: 'gtc',
      updated_timestamp: 1_700_000_000_000,
    });

    expect(order).toMatchInlineSnapshot(`
      {
        "clientOrderId": undefined,
        "createdTimestamp": 1700000000000,
        "filledQuantity": "1",
        "id": 123,
        "instrumentId": 1,
        "postOnly": false,
        "price": "100",
        "quantity": "2",
        "reduceOnly": true,
        "restingQuantity": "1",
        "side": "BUY",
        "status": "partial",
        "timeInForce": "gtc",
        "tpSl": undefined,
        "updatedTimestamp": 1700000000000,
      }
    `);
  });
});

describe('PerpsOrderUpdateSchema', () => {
  it('normalizes order update side', () => {
    const order = PerpsOrderUpdateSchema.parse({
      buy: false,
      coid: '0123456789abcdef0123456789abcdef',
      cts: 1_700_000_000_000,
      fill: '0',
      iid: 1,
      oid: 123,
      p: '100',
      po: false,
      qty: '2',
      rest: '2',
      ro: true,
      status: 'open',
      tif: 'gtc',
      uts: 1_700_000_000_000,
    });

    expect(order).toMatchInlineSnapshot(`
      {
        "clientOrderId": "0123456789abcdef0123456789abcdef",
        "createdTimestamp": 1700000000000,
        "filledQuantity": "0",
        "id": 123,
        "instrumentId": 1,
        "postOnly": false,
        "price": "100",
        "quantity": "2",
        "reduceOnly": true,
        "restingQuantity": "2",
        "side": "SELL",
        "status": "open",
        "timeInForce": "gtc",
        "tpSl": undefined,
        "updatedTimestamp": 1700000000000,
      }
    `);
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

  it('normalizes TP/SL metadata', () => {
    const order = PerpsOrderSchema.parse({
      order_id: 123,
      instrument_id: 1,
      buy: false,
      price: '0',
      quantity: '0',
      tif: 'ioc',
      post_only: false,
      ro: true,
      status: 'armed',
      resting_quantity: '0',
      filled_quantity: '0',
      created_timestamp: 1_700_000_000_000,
      updated_timestamp: 1_700_000_000_001,
      tpsl: {
        kind: 'sl',
        scope: 'position',
        trp: '90.00',
        armed_qty: '0',
        slip_bps: 0,
      },
    });

    expect(order.tpSl).toMatchInlineSnapshot(`
      {
        "armedQuantity": "0",
        "kind": "sl",
        "parentOrderId": undefined,
        "scope": "position",
        "slippageBps": 0,
        "triggerPrice": "90.00",
      }
    `);
  });
});
