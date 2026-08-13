import { z } from 'zod';
import {
  BaseUnitsSchema,
  EpochMillisecondsSchema,
  EvmAddressSchema,
} from '../shared';

export enum KnownFundingTransactionStatus {
  DepositDetected = 'DEPOSIT_DETECTED',
  Processing = 'PROCESSING',
  OriginTransactionConfirmed = 'ORIGIN_TX_CONFIRMED',
  Submitted = 'SUBMITTED',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
}

/**
 * A funding transaction status. Known statuses are enumerated in
 * {@link KnownFundingTransactionStatus}; newly introduced statuses flow
 * through as plain strings.
 */
export type FundingTransactionStatus =
  | KnownFundingTransactionStatus
  | (string & {});

export const FundingTransactionStatusSchema = z
  .string()
  .transform((value): FundingTransactionStatus => value);

const FundingEvmAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .pipe(EvmAddressSchema);

export const FundingAddressesSchema = z
  .object({
    evm: FundingEvmAddressSchema,
    svm: z.string().min(1),
    btc: z.string().min(1),
    tron: z.string().min(1).optional(),
    // Some documentation calls the Tron address type `tvm`.
    tvm: z.string().min(1).optional(),
  })
  .transform(({ tvm, ...addresses }) => ({
    ...addresses,
    ...(addresses.tron === undefined && tvm !== undefined ? { tron: tvm } : {}),
  }));

export type FundingAddresses = z.infer<typeof FundingAddressesSchema>;

export const FundingWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type FundingWarning = z.infer<typeof FundingWarningSchema>;

export const FundingAddressSetResponseSchema = z
  .object({
    address: FundingAddressesSchema,
    note: z.string().optional(),
    warnings: z.array(FundingWarningSchema).optional(),
  })
  .transform((response) => ({
    addresses: response.address,
    ...(response.note === undefined ? {} : { note: response.note }),
    ...(response.warnings === undefined ? {} : { warnings: response.warnings }),
  }));

export type FundingAddressSet = z.infer<typeof FundingAddressSetResponseSchema>;

export const FundingTokenSchema = z.object({
  name: z.string(),
  symbol: z.string(),
  address: z.string(),
  decimals: z.number().int().nonnegative(),
});

export type FundingToken = z.infer<typeof FundingTokenSchema>;

export const FundingAssetSchema = z.object({
  chainId: z.string(),
  chainName: z.string(),
  token: FundingTokenSchema,
  minCheckoutUsd: z.number(),
});

export type FundingAsset = z.infer<typeof FundingAssetSchema>;

export const SupportedFundingAssetsResponseSchema = z.object({
  supportedAssets: z.array(FundingAssetSchema),
  note: z.string().optional(),
});

export const FundingFeeBreakdownSchema = z.object({
  appFeeLabel: z.string(),
  appFeePercent: z.number(),
  appFeeUsd: z.number(),
  fillCostPercent: z.number(),
  fillCostUsd: z.number(),
  gasUsd: z.number(),
  maxSlippage: z.number(),
  minReceived: z.number(),
  swapImpact: z.number(),
  swapImpactUsd: z.number(),
  totalImpact: z.number(),
  totalImpactUsd: z.number(),
});

export type FundingFeeBreakdown = z.infer<typeof FundingFeeBreakdownSchema>;

export const FundingQuoteSchema = z.object({
  estCheckoutTimeMs: z.number().int().nonnegative(),
  estFeeBreakdown: FundingFeeBreakdownSchema,
  estInputUsd: z.number(),
  estOutputUsd: z.number(),
  estToTokenBaseUnit: BaseUnitsSchema,
  quoteId: z.string().min(1),
});

export type FundingQuote = z.infer<typeof FundingQuoteSchema>;

export const FundingTransactionSchema = z.object({
  fromChainId: z.string(),
  fromTokenAddress: z.string(),
  fromAmountBaseUnit: BaseUnitsSchema,
  toChainId: z.string(),
  toTokenAddress: z.string(),
  status: FundingTransactionStatusSchema,
  txHash: z.string().min(1).optional(),
  createdTimeMs: EpochMillisecondsSchema.optional(),
});

export type FundingTransaction = z.infer<typeof FundingTransactionSchema>;

export const FundingTransactionsPageSchema = z.object({
  transactions: z.array(FundingTransactionSchema),
  // Production temporarily omits the new field during the pagination rollout.
  nextCursor: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});
