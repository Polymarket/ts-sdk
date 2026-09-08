import type { Market, PublicClient } from '@polymarket/client';

type MarketLookupClient = Pick<PublicClient, 'fetchOrderBook' | 'listMarkets'>;

export enum OrderExampleMarketVersion {
  V1 = 1,
  V2 = 2,
}

export type OrderExampleMarket = {
  market: Market;
  version: OrderExampleMarketVersion;
};

export async function findOrderExampleMarket(
  client: MarketLookupClient,
): Promise<OrderExampleMarket> {
  const paginator = client.listMarkets({
    closed: false,
    liquidityNumMin: 1000,
    pageSize: 1000,
    order: 'liquidityNum',
    ascending: false,
    sportsMarketTypes: ['moneyline', 'spreads', 'totals'],
  });

  for await (const page of paginator) {
    for (const candidate of page.items) {
      const version = await orderExampleMarketVersion(client, candidate);

      if (version !== null) {
        return { market: candidate, version };
      }
    }
  }

  throw new Error('Could not find a live market for the order example');
}

async function orderExampleMarketVersion(
  client: MarketLookupClient,
  candidate: Market,
): Promise<OrderExampleMarketVersion | null> {
  const version = resolveOrderExampleMarketVersion(candidate);

  if (
    version === null ||
    candidate.state.enableOrderBook !== true ||
    candidate.state.acceptingOrders === false ||
    candidate.trading.minimumOrderSize === null ||
    candidate.trading.minimumOrderSize === undefined ||
    candidate.trading.minimumTickSize === null ||
    candidate.trading.minimumTickSize === undefined ||
    candidate.prices.bestAsk === null ||
    candidate.prices.bestAsk === undefined ||
    Number(candidate.prices.bestAsk) >= 1 ||
    candidate.prices.bestBid === null ||
    candidate.prices.bestBid === undefined ||
    Number(candidate.prices.bestBid) <= 0 ||
    Number(
      candidate.metrics.liquidityClob ?? candidate.metrics.liquidityNum ?? 0,
    ) <= 0
  ) {
    return null;
  }

  const assetId =
    version === OrderExampleMarketVersion.V1
      ? candidate.outcomes.yes.tokenId
      : candidate.outcomes.yes.positionId;

  if (assetId === null) {
    return null;
  }

  try {
    const book = await client.fetchOrderBook({ assetId });

    return book.asks.length > 0 && book.bids.length > 0 ? version : null;
  } catch {
    return null;
  }
}

function resolveOrderExampleMarketVersion(
  market: Market,
): OrderExampleMarketVersion | null {
  // CTF markets may also expose position IDs for Combos, so the presence of a
  // complete token pair remains the V1 discriminant when both pairs exist.
  if (
    market.outcomes.yes.tokenId !== null &&
    market.outcomes.no.tokenId !== null
  ) {
    return OrderExampleMarketVersion.V1;
  }

  if (
    market.outcomes.yes.positionId !== null &&
    market.outcomes.no.positionId !== null
  ) {
    return OrderExampleMarketVersion.V2;
  }

  return null;
}
