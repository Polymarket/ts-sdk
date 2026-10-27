import { describe, expect, it } from 'vitest';
import { PerpsTwapAcceptedSchema, PerpsTwapSchema } from './twaps';

const run = {
  twid: Number.MAX_SAFE_INTEGER,
  iid: 1,
  buy: true,
  qty: '1.000000000000000001',
  fill: '0.1',
  dur: 300000,
  ivl: 30000,
  rnd: false,
  slip_bps: 0,
  min_px: '0',
  max_px: '0',
  ro: false,
  st: 'paused',
  slices: 1,
  slice_count: 10,
  sts: 1767225600000,
  ets: 1767225900000,
  cts: 1767225600000,
  avg_px: '50012.500000000000000001',
};
describe('TWAP responses', () => {
  it('preserves identities, decimal precision and active-run state', () => {
    expect(PerpsTwapSchema.parse(run)).toMatchObject({
      twapId: Number.MAX_SAFE_INTEGER,
      side: 'BUY',
      quantity: run.qty,
      averagePrice: run.avg_px,
      status: 'paused',
      slippageBps: 0,
    });
    expect(
      PerpsTwapAcceptedSchema.parse({
        status: 'ok',
        twid: run.twid,
        ts: run.cts,
      }),
    ).toEqual({ twapId: run.twid, timestamp: run.cts });
  });
  it('rejects unsafe identities and incomplete or invalid active-run responses', () => {
    expect(
      PerpsTwapSchema.safeParse({ ...run, twid: Number.MAX_SAFE_INTEGER + 1 })
        .success,
    ).toBe(false);
    expect(PerpsTwapSchema.safeParse({ ...run, st: 'completed' }).success).toBe(
      false,
    );
    expect(PerpsTwapSchema.safeParse({ ...run, fill: undefined }).success).toBe(
      false,
    );
    expect(
      PerpsTwapAcceptedSchema.safeParse({ status: 'ok', twid: 1 }).success,
    ).toBe(false);
  });
});
