import { describe, expect, it } from 'vitest';
import { ComboPositionSchema } from './portfolio';

describe('ComboPositionSchema', () => {
  it('preserves entry-basis decimal strings without precision loss', () => {
    const position = ComboPositionSchema.parse({
      combo_condition_id: `0x03${'1'.repeat(60)}`,
      combo_position_id: 'position-1',
      side: 'YES',
      module_id: 1,
      user_address: `0x${'2'.repeat(40)}`,
      shares_balance: '12345678901234567890.123456789012345678',
      entry_avg_price_usdc: '0.123456789012345678',
      entry_cost_usdc: '12345678901234567890.123456789012345678',
      gross_entry_cost_usdc: '12345678901234567891.987654321098765432',
      entry_fees_usdc: '0.000000000000000123',
      realized_payout_usdc: '0',
      total_cost_usdc: '12345678901234567891.987654321098765555',
      status: 'OPEN',
      redeemable: false,
      first_entry_at: '2026-08-14T00:00:00Z',
      resolved_at: null,
      updated_at: '2026-08-14T00:01:00Z',
      legs_total: 1,
      legs_resolved: 0,
      legs_pending: 1,
      legs: [
        {
          leg_index: 0,
          leg_position_id: 'leg-position-1',
          leg_condition_id: `0x${'3'.repeat(64)}`,
          leg_outcome_index: 0,
          leg_outcome_label: 'Yes',
          leg_status: 'OPEN',
          leg_resolved_at: null,
          leg_current_price: '0.123456789012345678',
          market: null,
        },
      ],
    });

    expect(position.grossEntryCostUsdc).toBe(
      '12345678901234567891.987654321098765432',
    );
    expect(position.entryFeesUsdc).toBe('0.000000000000000123');
  });
});
