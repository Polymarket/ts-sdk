import { z } from 'zod';
import { parseUserInput } from '../input';
import type { PriceSubscription } from './subscriptions';

const SymbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9._:/-]+$/);
const TwapSymbolSchema = SymbolSchema.refine(
  (value) => value.replaceAll('/', '').length > 0,
  {
    message: 'A time-weighted price symbol must contain more than slashes.',
  },
);
enum PriceEventType {
  Update = 'update',
  Subscribe = 'subscribe',
}
const PriceSubscriptionSchema = z.discriminatedUnion('topic', [
  z.strictObject({
    topic: z.literal('prices.crypto'),
    symbols: z.array(SymbolSchema).min(1),
  }),
  z.strictObject({
    topic: z.literal('prices.crypto.twap'),
    symbols: z.array(TwapSymbolSchema).min(1),
    windowSeconds: z.literal(60, {
      error: 'Only the 60-second time-weighted price series is available.',
    }),
  }),
  z.strictObject({
    topic: z.literal('prices.equity'),
    symbol: SymbolSchema,
    types: z.array(z.enum(PriceEventType)).optional(),
  }),
  z.strictObject({
    topic: z.literal('prices.polymarket'),
    assetIds: z
      .array(
        z
          .string()
          .regex(/^\d+$/)
          .transform((value) => value.replace(/^0+/, '') || '0')
          .pipe(z.string().max(78)),
      )
      .min(1),
  }),
]);

/** @internal Validates the complete price subscription before allocating connections. */
export function parsePriceSubscription(
  spec: PriceSubscription,
): PriceSubscription {
  return parseUserInput(spec, PriceSubscriptionSchema);
}
