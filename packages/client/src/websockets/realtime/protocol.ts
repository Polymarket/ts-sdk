import { PolyboltChannel } from '@polymarket/bindings/subscriptions';
import type { PriceSubscription } from '../../actions/subscriptions';

export type PolyboltFilter =
  | { symbol: string; window_seconds?: 60 }
  | { asset_id: string };
export type PolyboltSubscription = {
  key: string;
  channel: PolyboltChannel;
  filter: PolyboltFilter;
  symbol?: string;
};

export function subscriptionsFor(
  spec: PriceSubscription,
): PolyboltSubscription[] {
  if (spec.topic === 'prices.polymarket') {
    return spec.assetIds.map((asset_id) =>
      entry(PolyboltChannel.Polymarket, { asset_id }),
    );
  }
  if (spec.topic === 'prices.equity') {
    const { symbol } = spec;
    return [
      entry(
        PolyboltChannel.Equity,
        { symbol: symbol.toLowerCase() },
        symbol.toLowerCase(),
      ),
    ];
  }
  const twap = spec.topic === 'prices.crypto.twap';
  return spec.symbols.map((input) => {
    const symbol = normalizeCryptoSymbol(input);
    return entry(
      twap ? PolyboltChannel.Twap : PolyboltChannel.Crypto,
      twap
        ? {
            symbol,
            window_seconds: spec.windowSeconds,
          }
        : { symbol },
      symbol,
    );
  });
}

function normalizeCryptoSymbol(input: string): string {
  return input.toLowerCase().replaceAll('/', '').replace(/usdt$/, 'usd');
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
