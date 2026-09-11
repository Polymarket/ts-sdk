import { createSecureClient } from '@polymarket/client';
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
    { topic: 'prices.crypto.twap', symbols: ['btc/usd'], windowSeconds: 60 },
    { topic: 'prices.equity', symbol: 'aapl' },
  ]);
  let count = 0;
  for await (const event of prices) {
    if (event.type === 'subscribe')
      console.log(event.topic, event.payload.symbol, event.payload.data);
    else console.log(event.topic, event.payload.symbol, event.payload.value);
    if (++count === 20) break;
  }
} finally {
  await client.closeSubscriptions();
}
