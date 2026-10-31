import { z } from 'zod';

/** A supported crypto market configuration variant. */
export const CryptoMarketConfigSchema = z.object({
  id: z.string(),
  asset: z.string(),
  duration: z.string(),
  twapEnabled: z.boolean(),
  twapLookbackSeconds: z.number().int().optional(),
});

export type CryptoMarketConfig = z.infer<typeof CryptoMarketConfigSchema>;

export const FetchCryptoMarketConfigsResponseSchema = z
  .array(CryptoMarketConfigSchema)
  .nullable()
  .transform((configs) => configs ?? []);
