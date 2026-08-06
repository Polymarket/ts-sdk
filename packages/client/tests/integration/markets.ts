import type { Market, PublicClient } from '@polymarket/client';

export async function findHighVolumeLowPriceMarket(
  publicClient: PublicClient,
): Promise<Market> {
  const paginator = publicClient.listMarkets({
    closed: false,
    liquidityNumMin: 1000,
    pageSize: 1000,
    order: 'liquidityNum',
    ascending: false,
    sportsMarketTypes: ['moneyline', 'spreads', 'totals'],
  });

  for await (const page of paginator) {
    for (const candidate of page.items) {
      if (await isEligibleTradeCandidate(publicClient, candidate)) {
        return candidate;
      }
    }
  }

  throw new Error(
    'Could not find an active high-volume market with a very low tradable price',
  );
}

function hasRequiredOrderFields(candidate: Market) {
  return (
    candidate.state.enableOrderBook === true &&
    candidate.state.acceptingOrders !== false &&
    candidate.trading.minimumOrderSize !== null &&
    candidate.trading.minimumOrderSize !== undefined &&
    (candidate.trading.secondsDelay ?? 0) === 0 &&
    candidate.outcomes.yes.tokenId !== null
  );
}

async function isEligibleTradeCandidate(
  publicClient: PublicClient,
  candidate: Market,
) {
  if (
    !hasRequiredOrderFields(candidate) ||
    !hasTradableBestAsk(candidate) ||
    !hasTradableBestBid(candidate) ||
    !hasClobLiquidity(candidate)
  ) {
    return false;
  }

  return hasLiveOrderBook(publicClient, candidate);
}

function hasTradableBestAsk(candidate: Market) {
  return (
    candidate.prices.bestAsk !== null &&
    candidate.prices.bestAsk !== undefined &&
    Number(candidate.prices.bestAsk) < 1
  );
}

function hasTradableBestBid(candidate: Market) {
  return (
    candidate.prices.bestBid !== null &&
    candidate.prices.bestBid !== undefined &&
    Number(candidate.prices.bestBid) > 0
  );
}

function hasClobLiquidity(candidate: Market) {
  return (
    Number(
      candidate.metrics.liquidityClob ?? candidate.metrics.liquidityNum ?? 0,
    ) > 0
  );
}

async function hasLiveOrderBook(publicClient: PublicClient, candidate: Market) {
  const tokenId = candidate.outcomes.yes.tokenId;

  if (tokenId === null) {
    return false;
  }

  try {
    const book = await publicClient.fetchOrderBook({ tokenId });

    return book.asks.length > 0 && book.bids.length > 0;
  } catch {
    return false;
  }
}
