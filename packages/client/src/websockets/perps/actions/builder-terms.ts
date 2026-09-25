import { EvmAddressSchema } from '@polymarket/bindings';
import { z } from 'zod';

/**
 * Builder account and additional fee applied to eligible order executions.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsBuilderTermsInput = {
  /** Address of the builder account receiving the fee. */
  readonly address: string;
  /** Exact non-negative decimal fraction of executed notional. */
  readonly feeRate: string;
};

/** @internal */
export const PerpsBuilderFeeRateInputSchema = z
  .string()
  .regex(
    /^\d+(?:\.\d{1,28})?$/,
    'Expected a non-negative fixed-point fee rate with at most 28 fractional digits.',
  );

/** @internal */
export const PerpsBuilderTermsInputSchema = z.object({
  address: EvmAddressSchema,
  feeRate: PerpsBuilderFeeRateInputSchema,
}) satisfies z.ZodType<PerpsBuilderTermsInput>;
