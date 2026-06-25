import { z } from 'zod';
import {
  BaseUnitsSchema,
  DecimalStringSchema,
  EpochMillisecondsSchema,
  EvmAddressSchema,
  TxHashSchema,
} from '../shared';
import {
  PerpsAssetSchema,
  PerpsDataResponseSchema,
  PerpsDepositStatusSchema,
  PerpsInternalTransferDirectionSchema,
  PerpsInternalTransferIdSchema,
  PerpsWithdrawalIdSchema,
  PerpsWithdrawalStatusSchema,
  RawPerpsTxHashSchema,
} from './common';

export const PerpsDepositSchema = z
  .object({
    hash: TxHashSchema,
    asset: PerpsAssetSchema,
    amount: BaseUnitsSchema,
    status: PerpsDepositStatusSchema,
    from: EvmAddressSchema,
    to: EvmAddressSchema,
    confirmations: z.number().int().nonnegative(),
    required_confirmations: z.number().int().nonnegative(),
    created_timestamp: EpochMillisecondsSchema,
    confirmed_timestamp: EpochMillisecondsSchema.optional(),
  })
  .transform((deposit) => ({
    hash: deposit.hash,
    asset: deposit.asset,
    amount: deposit.amount,
    status: deposit.status,
    from: deposit.from,
    to: deposit.to,
    confirmations: deposit.confirmations,
    requiredConfirmations: deposit.required_confirmations,
    createdTimestamp: deposit.created_timestamp,
    confirmedTimestamp: deposit.confirmed_timestamp,
  }));

export type PerpsDeposit = z.infer<typeof PerpsDepositSchema>;

export const ListPerpsDepositsResponseSchema =
  PerpsDataResponseSchema(PerpsDepositSchema);

export const RawPerpsDepositUpdateSchema = z
  .object({
    hash: RawPerpsTxHashSchema,
    asset: PerpsAssetSchema,
    amount: BaseUnitsSchema,
    status: PerpsDepositStatusSchema,
  })
  .transform((deposit) => ({
    hash: deposit.hash,
    asset: deposit.asset,
    amount: deposit.amount,
    status: deposit.status,
  }));

export const PerpsWithdrawalSchema = z
  .object({
    withdraw_id: PerpsWithdrawalIdSchema,
    asset: PerpsAssetSchema,
    amount: BaseUnitsSchema,
    fee: DecimalStringSchema,
    status: PerpsWithdrawalStatusSchema,
    to: EvmAddressSchema,
    hash: RawPerpsTxHashSchema,
    confirmations: z.number().int().nonnegative(),
    required_confirmations: z.number().int().nonnegative(),
    created_timestamp: EpochMillisecondsSchema,
    confirmed_timestamp: EpochMillisecondsSchema.optional(),
  })
  .transform((withdrawal) => ({
    withdrawalId: withdrawal.withdraw_id,
    asset: withdrawal.asset,
    amount: withdrawal.amount,
    fee: withdrawal.fee,
    status: withdrawal.status,
    to: withdrawal.to,
    hash: withdrawal.hash,
    confirmations: withdrawal.confirmations,
    requiredConfirmations: withdrawal.required_confirmations,
    createdTimestamp: withdrawal.created_timestamp,
    confirmedTimestamp: withdrawal.confirmed_timestamp,
  }));

export type PerpsWithdrawal = z.infer<typeof PerpsWithdrawalSchema>;

export const ListPerpsWithdrawalsResponseSchema = PerpsDataResponseSchema(
  PerpsWithdrawalSchema,
);

export const RawPerpsWithdrawResponseSchema = z
  .object({
    status: z.enum(['ok', 'err']),
    withdraw_id: PerpsWithdrawalIdSchema.optional(),
    error: z.string().optional(),
  })
  .transform((response) => ({
    status: response.status,
    withdrawalId: response.withdraw_id,
    error: response.error,
  }));

export const RawPerpsWithdrawalUpdateSchema = z
  .object({
    withdraw_id: PerpsWithdrawalIdSchema,
    asset: PerpsAssetSchema,
    amount: BaseUnitsSchema,
    fee: DecimalStringSchema,
    status: PerpsWithdrawalStatusSchema,
    to: EvmAddressSchema,
    hash: RawPerpsTxHashSchema,
  })
  .transform((withdrawal) => ({
    withdrawalId: withdrawal.withdraw_id,
    asset: withdrawal.asset,
    amount: withdrawal.amount,
    fee: withdrawal.fee,
    status: withdrawal.status,
    to: withdrawal.to,
    hash: withdrawal.hash,
  }));

export const PerpsInternalTransferSchema = z.object({
  transferId: PerpsInternalTransferIdSchema,
  asset: PerpsAssetSchema,
  amount: BaseUnitsSchema,
  direction: PerpsInternalTransferDirectionSchema,
  counterparty: EvmAddressSchema,
  label: z.string().optional(),
  createdTimestamp: EpochMillisecondsSchema,
});

export type PerpsInternalTransfer = z.infer<typeof PerpsInternalTransferSchema>;
