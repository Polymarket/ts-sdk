import { describe, expect, it } from 'vitest';
import {
  PerpsKnownInternalTransferType,
  PerpsKnownWithdrawalStatus,
} from './common';
import {
  PerpsDepositUpdateSchema,
  PerpsInternalTransferResponseSchema,
  PerpsInternalTransferSchema,
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

describe('PerpsInternalTransferSchema', () => {
  const rawTransfer = {
    transfer_id: 42,
    type: 'transfer',
    asset: 'USDC',
    amount: '100.00',
    direction: 'out',
    counterparty: '0x0000000000000000000000000000000000000002',
    label: 'treasury-rebalance-42',
    created_timestamp: 1_700_000_000_000,
  };

  it('normalizes raw transfer history fields and known classifications', () => {
    const transfer = PerpsInternalTransferSchema.parse(rawTransfer);

    expect(transfer).toEqual({
      transferId: 42,
      type: PerpsKnownInternalTransferType.Transfer,
      asset: 'USDC',
      amount: '100.00',
      direction: 'out',
      counterparty: rawTransfer.counterparty,
      label: rawTransfer.label,
      createdTimestamp: rawTransfer.created_timestamp,
    });
  });

  it('parses referral payouts and passes future classifications through', () => {
    expect(
      PerpsInternalTransferSchema.parse({
        ...rawTransfer,
        type: 'referral_payout',
      }).type,
    ).toBe(PerpsKnownInternalTransferType.ReferralPayout);
    expect(
      PerpsInternalTransferSchema.parse({
        ...rawTransfer,
        type: 'future_transfer_type',
      }).type,
    ).toBe('future_transfer_type');
  });

  it('rejects missing and empty classifications', () => {
    const { type: _type, ...withoutType } = rawTransfer;

    expect(PerpsInternalTransferSchema.safeParse(withoutType).success).toBe(
      false,
    );
    expect(
      PerpsInternalTransferSchema.safeParse({ ...rawTransfer, type: '' })
        .success,
    ).toBe(false);
  });
});

describe('PerpsInternalTransferResponseSchema', () => {
  it('normalizes strict accepted responses', () => {
    expect(
      PerpsInternalTransferResponseSchema.parse({
        status: 'ok',
        transfer_id: 42,
      }),
    ).toEqual({ status: 'ok', transferId: 42 });

    expect(
      PerpsInternalTransferResponseSchema.safeParse({
        status: 'ok',
        transfer_id: 42,
        unexpected: true,
      }).success,
    ).toBe(false);
  });
});
