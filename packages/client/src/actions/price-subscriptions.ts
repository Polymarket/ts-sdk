import { z } from 'zod';
import { parseUserInput } from '../input';
import type { PriceSubscription } from './subscriptions';

const SymbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9._:/-]+$/);
const CryptoSymbolSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+usd$/, {
    error:
      'Use a canonical lowercase USD pair such as btcusd. Slash-separated symbols and USDT pairs are not supported.',
  });
enum PriceEventType {
  Update = 'update',
  Subscribe = 'subscribe',
}
const PriceSubscriptionSchema = z.discriminatedUnion('topic', [
  z.strictObject({
    topic: z.literal('prices.crypto'),
    symbols: z.array(CryptoSymbolSchema).min(1),
  }),
  z.strictObject({
    topic: z.literal('prices.crypto.twap'),
    symbols: z.array(CryptoSymbolSchema).min(1),
  }),
  z.strictObject({
    topic: z.literal('prices.equity'),
    symbol: SymbolSchema,
    types: z.array(z.enum(PriceEventType)).optional(),
  }),
]);

/** @internal Validates the complete price subscription before allocating connections. */
export function parsePriceSubscription(
  spec: PriceSubscription,
): PriceSubscription {
  return parseUserInput(spec, PriceSubscriptionSchema);
}
