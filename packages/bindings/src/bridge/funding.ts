import { z } from 'zod';
import {
  type BaseUnits,
  BaseUnitsSchema,
  type EpochMilliseconds,
  EpochMillisecondsSchema,
  type EvmAddress,
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

/** Chain-specific addresses that can receive funds for a funding workflow. */
export type FundingAddresses = {
  /** Address used for EVM-compatible source chains. */
  evm: EvmAddress;
  /** Address used for Solana source transfers. */
  svm: string;
  /** Address used for Bitcoin source transfers. */
  btc: string;
  /** Address used for Tron source transfers, when available. */
  tron?: string;
};

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
  })) satisfies z.ZodType<FundingAddresses>;

/** A warning returned while creating funding addresses. */
export type FundingWarning = {
  /** Stable warning code intended for programmatic handling. */
  code: string;
  /** Human-readable explanation of the warning. */
  message: string;
};

export const FundingWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
}) satisfies z.ZodType<FundingWarning>;

/** Addresses and guidance returned for a deposit or withdrawal workflow. */
export type FundingAddressSet = {
  /** Addresses grouped by the source chain's address family. */
  addresses: FundingAddresses;
  /** Additional usage guidance returned by the funding provider. */
  note?: string;
  /** Non-fatal warnings associated with the generated addresses. */
  warnings?: FundingWarning[];
};

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
  })) satisfies z.ZodType<FundingAddressSet>;

/** A token supported by an account-funding route. */
export type FundingToken = {
  /** Display name reported for the token. */
  name: string;
  /** Display symbol reported for the token. */
  symbol: string;
  /** Chain-specific token address or asset identifier. */
  address: string;
  /** Number of decimal places used to convert display amounts to base units. */
  decimals: number;
};

export const FundingTokenSchema = z.object({
  name: z.string(),
  symbol: z.string(),
  address: z.string(),
  decimals: z.number().int().nonnegative(),
}) satisfies z.ZodType<FundingToken>;

/** A chain and token pair currently supported for funding or withdrawal. */
export type FundingAsset = {
  /** Chain identifier serialized as a decimal string. */
  chainId: string;
  /** Human-readable chain name. */
  chainName: string;
  /** Token supported on the chain. */
  token: FundingToken;
  /** Minimum supported transfer value in US dollars. */
  minCheckoutUsd: number;
};

export const FundingAssetSchema = z.object({
  chainId: z.string(),
  chainName: z.string(),
  token: FundingTokenSchema,
  minCheckoutUsd: z.number(),
}) satisfies z.ZodType<FundingAsset>;

export const SupportedFundingAssetsResponseSchema = z.object({
  supportedAssets: z.array(FundingAssetSchema),
  note: z.string().optional(),
});

/** Estimated costs and price impact for a funding quote. */
export type FundingFeeBreakdown = {
  /** Human-readable label for the application fee. */
  appFeeLabel: string;
  /** Application fee in percentage points; `0.3` means `0.3%`. */
  appFeePercent: number;
  /** Estimated application fee in US dollars. */
  appFeeUsd: number;
  /** Estimated fill cost in percentage points. */
  fillCostPercent: number;
  /** Estimated fill cost in US dollars. */
  fillCostUsd: number;
  /** Estimated network gas cost in US dollars. */
  gasUsd: number;
  /** Maximum slippage in percentage points. */
  maxSlippage: number;
  /** Minimum destination amount in display units, after estimated slippage. */
  minReceived: number;
  /** Estimated swap impact in percentage points. */
  swapImpact: number;
  /** Estimated swap impact in US dollars. */
  swapImpactUsd: number;
  /** Total estimated impact in percentage points. */
  totalImpact: number;
  /** Total estimated impact in US dollars. */
  totalImpactUsd: number;
};

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
}) satisfies z.ZodType<FundingFeeBreakdown>;

/** An estimated conversion result for a deposit or withdrawal. */
export type FundingQuote = {
  /** Estimated time for the transfer to complete, in milliseconds. */
  estCheckoutTimeMs: number;
  /** Estimated fees and price impact. */
  estFeeBreakdown: FundingFeeBreakdown;
  /** Estimated source value in US dollars. */
  estInputUsd: number;
  /** Estimated destination value in US dollars. */
  estOutputUsd: number;
  /** Estimated destination-token amount in base units. */
  estToTokenBaseUnit: BaseUnits;
  /** Identifier for correlating this quote in logs and support requests. */
  quoteId: string;
};

export const FundingQuoteSchema = z.object({
  estCheckoutTimeMs: z.number().int().nonnegative(),
  estFeeBreakdown: FundingFeeBreakdownSchema,
  estInputUsd: z.number(),
  estOutputUsd: z.number(),
  estToTokenBaseUnit: BaseUnitsSchema,
  quoteId: z.string().min(1),
}) satisfies z.ZodType<FundingQuote>;

/** A detected deposit or withdrawal and its latest processing state. */
export type FundingTransaction = {
  /** Source chain identifier serialized as a decimal string. */
  fromChainId: string;
  /** Source token address or asset identifier. */
  fromTokenAddress: string;
  /** Source-token amount in base units. */
  fromAmountBaseUnit: BaseUnits;
  /** Destination chain identifier serialized as a decimal string. */
  toChainId: string;
  /** Destination token address or asset identifier. */
  toTokenAddress: string;
  /** Latest processing status reported for the transfer. */
  status: FundingTransactionStatus;
  /** Destination transaction hash or signature, once available. */
  txHash?: string;
  /** Time processing began, as Unix epoch milliseconds. */
  createdTimeMs?: EpochMilliseconds;
};

export const FundingTransactionSchema = z.object({
  fromChainId: z.string(),
  fromTokenAddress: z.string(),
  fromAmountBaseUnit: BaseUnitsSchema,
  toChainId: z.string(),
  toTokenAddress: z.string(),
  status: FundingTransactionStatusSchema,
  txHash: z.string().min(1).optional(),
  createdTimeMs: EpochMillisecondsSchema.optional(),
}) satisfies z.ZodType<FundingTransaction>;

export const FundingTransactionsPageSchema = z.object({
  transactions: z.array(FundingTransactionSchema),
  // Older deployments may omit the cursor field; treat them as terminal pages.
  nextCursor: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});
