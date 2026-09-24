import { describe, expect, it } from 'vitest';
import {
  PerpsBuilderFillUpdateEventSchema,
  PerpsSessionUpdateEventSchema,
} from '../subscriptions/perps';
import {
  ListPerpsBuilderEarningsResponseSchema,
  PerpsBuilderEarningSchema,
  PerpsBuilderEarningsSummarySchema,
  PerpsLiquidityRole,
} from './builders';

const receipt = {
  earning_id: '3:11:0',
  trade_id: 11,
  order_id: 42,
  instrument_id: 3,
  trader: '0x1111111111111111111111111111111111111111',
  buy: true,
  price: '100',
  quantity: '1',
  side: 'maker',
  timestamp: 123,
  sequence: 456,
  notional: '100',
  fee_asset: 'USDC',
  fee: '-0.2',
  builder_fee: '0',
  total_fee: '-0.2',
  fee_rate: '0',
};

describe('Perps builder receipts', () => {
  it('distinguishes trading direction from liquidity role and keeps zero-fee receipts', () => {
    expect(PerpsBuilderEarningSchema.parse(receipt)).toMatchObject({
      earningId: '3:11:0',
      side: 'BUY',
      liquidityRole: PerpsLiquidityRole.Maker,
      builderFee: '0',
      totalFee: '-0.2',
      feeRate: '0',
    });
    expect(PerpsBuilderEarningSchema.parse(receipt)).not.toHaveProperty(
      'clientOrderId',
    );
  });

  it('preserves snapshot metadata on empty history and summary responses', () => {
    const snapshot = {
      start_timestamp: 1,
      end_timestamp: 10,
      as_of_sequence: 456,
    };
    expect(
      ListPerpsBuilderEarningsResponseSchema.parse({
        data: [],
        more: false,
        ...snapshot,
      }),
    ).toEqual({
      data: [],
      more: false,
      snapshot: { start: 1, end: 10, asOfSequence: 456 },
    });
    expect(
      PerpsBuilderEarningsSummarySchema.parse({
        data: [],
        trader_count: 0,
        active_approval_count: 7,
        ...snapshot,
      }),
    ).toEqual({
      assets: [],
      traderCount: 0,
      activeApprovalCount: 7,
      snapshot: { start: 1, end: 10, asOfSequence: 456 },
    });
  });

  it('uses a separate event surface without widening ordinary session events', () => {
    const wire = {
      ch: 'builderFills',
      ts: 123,
      sq: 456,
      ets: 123,
      data: [receipt],
    };
    expect(PerpsBuilderFillUpdateEventSchema.parse(wire)).toMatchObject({
      type: 'builderFill',
      channel: 'builderFills',
      sequence: 456,
      payload: [
        { earningId: '3:11:0', liquidityRole: PerpsLiquidityRole.Maker },
      ],
    });
    expect(PerpsSessionUpdateEventSchema.safeParse(wire).success).toBe(false);
  });
});
