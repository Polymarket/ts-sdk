import { createSecureClient, OrderSide, OrderType } from '@polymarket/client';
import { privateKey } from '@polymarket/client/viem';
import { never } from './lib/assert';
import { requireEnv } from './lib/env';
import {
  findOrderExampleMarket,
  OrderExampleMarketVersion,
} from './lib/markets';

const secureClient = await createSecureClient({
  wallet: requireEnv('POLYMARKET_DEPOSIT_WALLET'),
  signer: privateKey(requireEnv('POLYMARKET_PRIVATE_KEY')),
});

const { market, version } = await findOrderExampleMarket(secureClient);
const assetId =
  (version === OrderExampleMarketVersion.V1
    ? market.outcomes.yes.tokenId
    : market.outcomes.yes.positionId) ??
  never('No YES asset ID found for market');
const minimumOrderSize =
  market.trading.minimumOrderSize ?? never('No minimum order size found');

const estimatedPrice = await secureClient.estimateMarketPrice({
  assetId,
  side: OrderSide.BUY,
  amount: minimumOrderSize,
  orderType: OrderType.FAK,
});

const order = await secureClient.createMarketOrder({
  assetId,
  side: OrderSide.BUY,
  amount: minimumOrderSize,
  orderType: OrderType.FAK,
});

console.table({
  market: market?.question ?? market?.slug ?? market?.id ?? never(),
  minimumOrderSize,
  assetId,
  side: order.side,
  orderType: order.orderType,
  estimatedPrice,
  maker: order.maker,
  makerAmount: order.makerAmount,
  takerAmount: order.takerAmount,
});
