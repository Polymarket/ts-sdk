import { describe, expect, it } from 'vitest';
import { RebatedFeesResponseSchema } from './rewards';

describe('maker rebate response', () => {
  it('preserves amount precision and the calendar day without a pagination envelope', () => {
    const fees = RebatedFeesResponseSchema.parse([
      {
        date: '2026-10-06',
        condition_id: `0x${'ab'.repeat(32)}`,
        asset_address: `0x${'cd'.repeat(20)}`,
        maker_address: `0x${'ef'.repeat(20)}`,
        rebated_fees_usdc: '9007199254740993.000000000000000001',
      },
    ]);
    expect(fees[0]?.rebatedFeesUsdc).toBe(
      '9007199254740993.000000000000000001',
    );
    expect(fees[0]?.date).toBe('2026-10-06');
    expect(RebatedFeesResponseSchema.parse([])).toEqual([]);
  });
});
