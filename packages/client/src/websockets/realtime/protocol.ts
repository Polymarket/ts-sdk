import type { PriceProvider } from '@polymarket/bindings/subscriptions';
import type { PriceSubscription } from '../../actions/subscriptions';

/** @internal A single canonical price subscription shared by listeners. */
export type PriceKey =
  | {
      key: string;
      topic: 'prices.crypto';
      symbol: string;
      provider?: PriceProvider;
    }
  | {
      key: string;
      topic: 'prices.crypto.twap' | 'prices.equity.twap';
      symbol: string;
      windowSeconds: 60;
      provider?: PriceProvider;
    }
  | {
      key: string;
      topic: 'prices.equity';
      symbol: string;
      provider?: PriceProvider;
    };

export function subscriptionsFor(spec: PriceSubscription): PriceKey[] {
  const symbols = 'symbol' in spec ? [spec.symbol.toLowerCase()] : spec.symbols;
  const { provider } = spec;
  return symbols.map((symbol) => {
    if (
      spec.topic === 'prices.crypto.twap' ||
      spec.topic === 'prices.equity.twap'
    ) {
      return {
        key: JSON.stringify([spec.topic, symbol, 60, provider]),
        topic: spec.topic,
        symbol,
        windowSeconds: 60,
        provider,
      };
    }
    return {
      key: JSON.stringify([spec.topic, symbol, provider]),
      topic: spec.topic,
      symbol,
      provider,
    };
  });
}

export function polyboltReconnectDelay(code: number, attempt: number): number {
  return (
    Math.random() *
    (code === 4003 ? 10_000 : Math.min(1_000 * 2 ** attempt, 30_000))
  );
}
