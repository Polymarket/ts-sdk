import { createSecureClient, PriceProvider } from '@polymarket/client';
import { privateKey } from '@polymarket/client/viem';
import { requireEnv } from './lib/env';

const signer = privateKey(requireEnv('POLYMARKET_PRIVATE_KEY'));
const client = await createSecureClient({
  signer,
  wallet: await signer.getAddress(),
});

try {
  const prices = await client.subscribe([
    { topic: 'prices.crypto', symbols: ['btcusd', 'ethusd'] },
    { topic: 'prices.crypto.twap', symbols: ['btcusd'] },
    { topic: 'prices.equity', symbol: 'aapl' },
    {
      topic: 'prices.equity.twap',
      symbol: 'USDJPY',
      provider: PriceProvider.Chainlink,
      onSubscribed({ provider }) {
        console.log('USDJPY served provider:', provider ?? 'not confirmed');
      },
    },
  ]);
  let count = 0;
  for await (const event of prices) {
    console.log('Price source:', event.payload.source);
    if (event.type === 'subscribe')
      console.log(event.topic, event.payload.symbol, event.payload.data);
    else console.log(event.topic, event.payload.symbol, event.payload.value);
    if (++count === 20) break;
  }
} finally {
  await client.closeSubscriptions();
}
