import { createPublicClient, OrderSide } from '@polymarket/client';
import { never } from './lib/assert';

const client = createPublicClient();

const {
  items: [market],
} = await client
  .listMarkets({
    pageSize: 1,
  })
  .firstPage();

const tokenId =
  market?.outcomes.yes.tokenId ?? never('No YES token found for market');

const [orderBook, buyPrice, midpoint, spread, lastTrade] = await Promise.all([
  client.fetchOrderBook({ tokenId }),
  client.fetchPrice({ tokenId, side: OrderSide.BUY }),
  client.fetchMidpoint({ tokenId }),
  client.fetchSpread({ tokenId }),
  client.fetchLastTradePrice({ tokenId }),
]);

console.log({
  market: market?.question ?? market?.slug ?? market?.id ?? never(),
  tokenId,
  bids: orderBook.bids.length,
  asks: orderBook.asks.length,
  buyPrice,
  midpoint,
  spread,
  lastTradePrice: lastTrade?.price ?? 'N/A',
  lastTradeSide: lastTrade?.side ?? 'N/A',
});
