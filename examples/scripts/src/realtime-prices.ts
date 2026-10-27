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
    // Omit provider to follow the default. A pin may fall back or be ignored;
    // each event's source identifies the actual producer.
    {
      topic: 'prices.equity',
      symbol: 'nvda',
      provider: PriceProvider.Chainlink,
      onSubscribed({ provider }) {
        console.log('nvda served provider:', provider ?? 'not confirmed');
      },
    },
    {
      topic: 'prices.equity.twap',
      symbol: 'USDJPY',
    },
  ]);
  let count = 0;
  for await (const event of prices) {
    if (event.type === 'subscribe')
      console.log(
        event.topic,
        event.payload.symbol,
        event.payload.source,
        event.payload.data,
      );
    else
      console.log(
        event.topic,
        event.payload.symbol,
        event.payload.source,
        event.payload.value,
      );
    if (++count === 20) break;
  }
} finally {
  await client.closeSubscriptions();
}
