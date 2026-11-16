import { PriceProvider } from '@polymarket/bindings/subscriptions';
import { z } from 'zod';
import { parseUserInput } from '../input';
import type {
  PriceSubscription,
  PriceSubscriptionConfirmation,
} from './subscriptions';

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
const OnSubscribedSchema = z
  .custom<
    (confirmation: PriceSubscriptionConfirmation) => void | Promise<void>
  >((value) => typeof value === 'function')
  .optional();

/** Provider fields; `providerApiKey` is only used with the Chainlink provider. */
const ProviderShape = {
  provider: z.enum(PriceProvider).optional(),
  providerApiKey: z.string().optional(),
};

const PriceSubscriptionSchema = z.discriminatedUnion('topic', [
  z.strictObject({
    topic: z.literal('prices.crypto'),
    symbols: z.array(CryptoSymbolSchema).min(1),
    ...ProviderShape,
    onSubscribed: OnSubscribedSchema,
  }),
  z.strictObject({
    topic: z.literal('prices.crypto.twap'),
    symbols: z.array(CryptoSymbolSchema).min(1),
    ...ProviderShape,
    onSubscribed: OnSubscribedSchema,
  }),
  z.strictObject({
    topic: z.literal('prices.equity'),
    symbol: SymbolSchema,
    types: z.array(z.enum(PriceEventType)).optional(),
    ...ProviderShape,
    onSubscribed: OnSubscribedSchema,
  }),
  z.strictObject({
    topic: z.literal('prices.equity.twap'),
    symbol: SymbolSchema,
    ...ProviderShape,
    onSubscribed: OnSubscribedSchema,
  }),
]);

/** @internal Validates the complete price subscription before allocating connections. */
export function parsePriceSubscription(
  spec: PriceSubscription,
): PriceSubscription {
  return parseUserInput(spec, PriceSubscriptionSchema);
}
