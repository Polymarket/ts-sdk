import {
  createSecureClient,
  type EnvironmentConfigFork,
  forkEnvironmentConfig,
} from '@polymarket/client';
import { privateKey } from '@polymarket/client/viem';
import { requireEnv } from './lib/env';

// Supply the JSON endpoint fork used by the integration suite, including
// realtime.ws for the staging price endpoint.
const fork = JSON.parse(
  requireEnv('POLYMARKET_INTEGRATION_ENVIRONMENT_CONFIG'),
) as EnvironmentConfigFork;
const client = await createSecureClient({
  environment: forkEnvironmentConfig(fork),
  wallet: requireEnv('POLYMARKET_DEPOSIT_WALLET'),
  signer: privateKey(requireEnv('POLYMARKET_PRIVATE_KEY')),
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
