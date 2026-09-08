import { PolyboltChannel } from '@polymarket/bindings/subscriptions';
import { z } from 'zod';
import type {
  CryptoPricesChainlinkTwapSubscription,
  CryptoPricesSubscription,
  EquityPricesSubscription,
  PriceSubscription,
} from '../../actions/subscriptions';
import { UserInputError } from '../../errors';
import { parseUserInput } from '../../input';

export type PolyboltSpec =
  | PriceSubscription
  | CryptoPricesSubscription
  | CryptoPricesChainlinkTwapSubscription
  | EquityPricesSubscription;
export type PolyboltFilter =
  | { symbol: string; window_seconds?: 30 | 60 }
  | { asset_id: string };
export type PolyboltSubscription = {
  key: string;
  channel: PolyboltChannel;
  filter: PolyboltFilter;
  symbol?: string;
};

const PriceSubscriptionSchema = z.object({
  symbols: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[a-zA-Z0-9._:/-]+$/),
    )
    .min(1),
  windowSeconds: z.union([z.literal(30), z.literal(60)]).optional(),
  includeSnapshot: z.boolean().optional(),
});
const EquitySubscriptionSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9._:/-]+$/),
  types: z.array(z.enum(['update', 'subscribe'])).optional(),
});
const BboSubscriptionSchema = z.object({
  assetIds: z
    .array(
      z
        .string()
        .regex(/^\d+$/)
        .transform((value) => value.replace(/^0+/, '') || '0')
        .pipe(z.string().max(78)),
    )
    .min(1),
});

export function subscriptionsFor(spec: PolyboltSpec): PolyboltSubscription[] {
  if (spec.topic === 'prices.polymarket') {
    return parseUserInput(spec, BboSubscriptionSchema).assetIds.map(
      (asset_id) => entry(PolyboltChannel.Polymarket, { asset_id }),
    );
  }
  if (spec.topic === 'prices.equity' || spec.topic === 'prices.equity.pyth') {
    const { symbol } = parseUserInput(spec, EquitySubscriptionSchema);
    return [
      entry(
        PolyboltChannel.Equity,
        { symbol: symbol.toLowerCase() },
        symbol.toLowerCase(),
      ),
    ];
  }
  const params = parseUserInput(spec, PriceSubscriptionSchema);
  const twap =
    spec.topic === 'prices.crypto.twap' ||
    spec.topic === 'prices.crypto.chainlink.twap';
  if (twap && params.windowSeconds === undefined)
    throw new UserInputError(
      'A time-weighted price subscription requires windowSeconds: 30 or 60.',
    );
  return params.symbols.map((input) => {
    const symbol = input.toLowerCase();
    if (twap && symbol.replaceAll('/', '') === '')
      throw new UserInputError(
        'A time-weighted price symbol must contain more than slashes.',
      );
    return entry(
      twap ? PolyboltChannel.Twap : PolyboltChannel.Crypto,
      twap
        ? {
            symbol: symbol.replaceAll('/', ''),
            window_seconds: params.windowSeconds,
          }
        : { symbol },
      symbol,
    );
  });
}

function entry(
  channel: PolyboltChannel,
  filter: PolyboltFilter,
  symbol?: string,
): PolyboltSubscription {
  return { key: JSON.stringify([channel, filter]), channel, filter, symbol };
}

export function polyboltReconnectDelay(code: number, attempt: number): number {
  return (
    Math.random() *
    (code === 4003 ? 10_000 : Math.min(1_000 * 2 ** attempt, 30_000))
  );
}
