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
  PerpsInternalTransferTypeSchema,
  PerpsTxHashSchema,
  PerpsWithdrawalIdSchema,
  PerpsWithdrawalStatusSchema,
} from './common';

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
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

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsDeposit = z.infer<typeof PerpsDepositSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const ListPerpsDepositsResponseSchema =
  PerpsDataResponseSchema(PerpsDepositSchema);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsDepositUpdateSchema = z
  .object({
    hash: PerpsTxHashSchema,
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

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsWithdrawalSchema = z
  .object({
    withdraw_id: PerpsWithdrawalIdSchema,
    asset: PerpsAssetSchema,
    amount: BaseUnitsSchema,
    fee: DecimalStringSchema,
    status: PerpsWithdrawalStatusSchema,
    to: EvmAddressSchema,
    hash: PerpsTxHashSchema,
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

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsWithdrawal = z.infer<typeof PerpsWithdrawalSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const ListPerpsWithdrawalsResponseSchema = PerpsDataResponseSchema(
  PerpsWithdrawalSchema,
);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsWithdrawResponseSchema = z
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

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsWithdrawalUpdateSchema = z
  .object({
    withdraw_id: PerpsWithdrawalIdSchema,
    asset: PerpsAssetSchema,
    amount: BaseUnitsSchema,
    fee: DecimalStringSchema,
    status: PerpsWithdrawalStatusSchema,
    to: EvmAddressSchema,
    hash: PerpsTxHashSchema,
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

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsInternalTransferSchema = z
  .object({
    transfer_id: PerpsInternalTransferIdSchema,
    type: PerpsInternalTransferTypeSchema,
    asset: PerpsAssetSchema,
    amount: DecimalStringSchema,
    direction: PerpsInternalTransferDirectionSchema,
    counterparty: EvmAddressSchema,
    label: z.string().optional(),
    created_timestamp: EpochMillisecondsSchema,
  })
  .transform((transfer) => ({
    transferId: transfer.transfer_id,
    type: transfer.type,
    asset: transfer.asset,
    amount: transfer.amount,
    direction: transfer.direction,
    counterparty: transfer.counterparty,
    label: transfer.label,
    createdTimestamp: transfer.created_timestamp,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsInternalTransfer = z.infer<typeof PerpsInternalTransferSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const ListPerpsInternalTransfersResponseSchema = PerpsDataResponseSchema(
  PerpsInternalTransferSchema,
);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsInternalTransferResponseSchema = z
  .strictObject({
    status: z.literal('ok'),
    transfer_id: PerpsInternalTransferIdSchema,
  })
  .transform((response) => ({
    status: response.status,
    transferId: response.transfer_id,
  }));
