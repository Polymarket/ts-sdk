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
  /** Exact decimal fraction between 0 and 0.001 (10 bps), inclusive. */
  readonly feeRate: string;
};

/** @internal */
export const PerpsBuilderFeeRateInputSchema = z.string().refine((value) => {
  // Comparing padded decimal digits avoids rounding at the fee cap. Requiring
  // at most 28 fractional digits also prevents rust_decimal from rounding.
  const match = /^0+(?:\.(\d{1,28}))?$/.exec(value);
  if (match === null) return false;
  return (match[1] ?? '').padEnd(28, '0') <= '001'.padEnd(28, '0');
}, 'Expected a fixed-point fee rate from 0 to 0.001 with at most 28 fractional digits.');

/** @internal */
export const PerpsBuilderTermsInputSchema = z.object({
  address: EvmAddressSchema,
  feeRate: PerpsBuilderFeeRateInputSchema,
}) satisfies z.ZodType<PerpsBuilderTermsInput>;
