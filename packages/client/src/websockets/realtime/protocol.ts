import type { PriceSubscription } from '../../actions/subscriptions';

/** @internal A single canonical price subscription shared by listeners. */
export type PriceKey =
  | { key: string; topic: 'prices.crypto'; symbol: string }
  | {
      key: string;
      topic: 'prices.crypto.twap';
      symbol: string;
      windowSeconds: 60;
    }
  | { key: string; topic: 'prices.equity'; symbol: string }
  | { key: string; topic: 'prices.polymarket'; assetId: string };

export function subscriptionsFor(spec: PriceSubscription): PriceKey[] {
  if (spec.topic === 'prices.polymarket') {
    return spec.assetIds.map((assetId) => ({
      key: JSON.stringify([spec.topic, assetId]),
      topic: spec.topic,
      assetId,
    }));
  }
  if (spec.topic === 'prices.equity') {
    const symbol = spec.symbol.toLowerCase();
    return [
      { key: JSON.stringify([spec.topic, symbol]), topic: spec.topic, symbol },
    ];
  }
  return spec.symbols.map((input) => {
    const symbol = input
      .toLowerCase()
      .replaceAll('/', '')
      .replace(/usdt$/, 'usd');
    if (spec.topic === 'prices.crypto.twap') {
      return {
        key: JSON.stringify([spec.topic, symbol, spec.windowSeconds]),
        topic: spec.topic,
        symbol,
        windowSeconds: spec.windowSeconds,
      };
    }
    return {
      key: JSON.stringify([spec.topic, symbol]),
      topic: spec.topic,
      symbol,
    };
  });
}

export function polyboltReconnectDelay(code: number, attempt: number): number {
  return (
    Math.random() *
    (code === 4003 ? 10_000 : Math.min(1_000 * 2 ** attempt, 30_000))
  );
}
