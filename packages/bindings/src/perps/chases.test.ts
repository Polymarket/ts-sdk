import { describe, expect, it } from 'vitest';
import { PerpsChaseAcceptedSchema, PerpsChaseSchema } from './chases';
import { PerpsOrderSchema, PerpsOrderUpdateSchema } from './orders';

const chase = {
  chid: 9007199254740991,
  iid: 1,
  buy: true,
  qty: '1.000000000000000001',
  fill: '0',
  lim: '100.000000000000000001',
  max_dist: '0',
  max_dist_bps: 50,
  po: true,
  ro: false,
  reference_price: '99.000000000000000001',
  reprices: 3,
  post_only_rejections: 0,
  cts: 1767225600000,
  oid: 42,
  coid: 'a'.repeat(32),
};

describe('chase response boundary', () => {
  it('preserves decimal precision, identities and active progress', () => {
    expect(PerpsChaseSchema.parse(chase)).toMatchObject({
      chaseId: chase.chid,
      orderId: 42,
      clientOrderId: chase.coid,
      quantity: chase.qty,
      limitPrice: chase.lim,
      referencePrice: chase.reference_price,
      maxDistanceBps: 50,
      reprices: 3,
      side: 'BUY',
      createdAt: chase.cts,
    });
    const { oid: _, coid: __, ...withoutChild } = chase;
    expect(PerpsChaseSchema.parse(withoutChild)).not.toHaveProperty('orderId');
    expect(
      PerpsChaseAcceptedSchema.parse({
        status: 'ok',
        chid: chase.chid,
        ts: chase.cts,
      }),
    ).toEqual({ chaseId: chase.chid, timestamp: chase.cts });
  });
  it.each([
    0, -1, 1.5, 9007199254740992,
  ])('rejects invalid chase identities %s', (chid) => {
    expect(PerpsChaseSchema.safeParse({ ...chase, chid }).success).toBe(false);
  });
  it('retains chase identity on REST history and private child order updates', () => {
    const update = {
      oid: 42,
      iid: 1,
      buy: true,
      p: '100',
      qty: '1',
      tif: 'gtc',
      po: true,
      ro: false,
      status: 'open',
      rest: '1',
      fill: '0',
      cts: chase.cts,
      uts: chase.cts,
      chid: chase.chid,
    };
    expect(PerpsOrderUpdateSchema.parse(update).chaseId).toBe(chase.chid);
    expect(
      PerpsOrderSchema.parse({
        order_id: 42,
        instrument_id: 1,
        buy: true,
        price: '100',
        quantity: '1',
        tif: 'gtc',
        post_only: true,
        ro: false,
        status: 'open',
        resting_quantity: '1',
        filled_quantity: '0',
        created_timestamp: chase.cts,
        updated_timestamp: chase.cts,
        chid: chase.chid,
      }).chaseId,
    ).toBe(chase.chid);
    const { chid: _, ...ordinary } = update;
    expect(PerpsOrderUpdateSchema.parse(ordinary)).not.toHaveProperty(
      'chaseId',
    );
  });
});
