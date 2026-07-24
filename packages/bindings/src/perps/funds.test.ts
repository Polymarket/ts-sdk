import { describe, expect, it } from 'vitest';
import { PerpsKnownWithdrawalStatus } from './common';
import {
  PerpsDepositUpdateSchema,
  PerpsWithdrawalSchema,
  PerpsWithdrawalUpdateSchema,
} from './funds';

const baseWithdrawal = {
  withdraw_id: 1,
  asset: 'USDC',
  amount: '1000000',
  fee: '0',
  status: 'pending',
  to: '0x0000000000000000000000000000000000000001',
  confirmations: 0,
  required_confirmations: 10,
  created_timestamp: 1_700_000_000_000,
};

describe('PerpsDepositUpdateSchema', () => {
  it.each(['', '0x'])('normalizes %s pending hashes to undefined', (hash) => {
    const deposit = PerpsDepositUpdateSchema.parse({
      hash,
      asset: 'USDC',
      amount: '1000000',
      status: 'pending',
    });

    expect(deposit.hash).toBeUndefined();
  });
});

describe('PerpsWithdrawalSchema', () => {
  it('normalizes empty pending hashes to undefined', () => {
    const withdrawal = PerpsWithdrawalSchema.parse({
      ...baseWithdrawal,
      hash: '',
    });

    expect(withdrawal.hash).toBeUndefined();
  });

  it('parses failed withdrawals', () => {
    const withdrawal = PerpsWithdrawalSchema.parse({
      ...baseWithdrawal,
      status: 'failed',
    });

    expect(withdrawal.status).toBe(PerpsKnownWithdrawalStatus.Failed);
  });

  it('passes unknown withdrawal statuses through as strings', () => {
    const withdrawal = PerpsWithdrawalSchema.parse({
      ...baseWithdrawal,
      status: 'not-a-status-yet',
    });

    expect(withdrawal.status).toBe('not-a-status-yet');
  });
});

describe('PerpsWithdrawalUpdateSchema', () => {
  it('normalizes placeholder pending hashes to undefined', () => {
    const withdrawal = PerpsWithdrawalUpdateSchema.parse({
      withdraw_id: baseWithdrawal.withdraw_id,
      asset: baseWithdrawal.asset,
      amount: baseWithdrawal.amount,
      fee: baseWithdrawal.fee,
      status: baseWithdrawal.status,
      to: baseWithdrawal.to,
      hash: '0x',
    });

    expect(withdrawal.hash).toBeUndefined();
  });
});
