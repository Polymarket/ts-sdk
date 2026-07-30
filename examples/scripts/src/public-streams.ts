import { createPublicClient } from '@polymarket/client';

const client = createPublicClient();

const stream = await client.subscribe([
  {
    topic: 'prices.crypto.chainlink',
  },
  {
    topic: 'prices.crypto.chainlink.twap',
    windowSeconds: 30,
    symbols: ['btc/usd'],
  },
  {
    topic: 'sports',
  },
]);

let eventCount = 0;

for await (const event of stream) {
  eventCount += 1;

  switch (event.topic) {
    case 'prices.crypto.chainlink':
      console.log(
        `${new Date(event.payload.timestamp).toLocaleString()} - Chainlink price update: ${event.payload.value} ${event.payload.symbol}`,
      );
      break;

    case 'prices.crypto.chainlink.twap':
      console.log(
        `${new Date(event.payload.timestamp).toLocaleString()} - Chainlink ${event.payload.windowSeconds}s TWAP update: ${event.payload.value} ${event.payload.symbol}`,
      );
      break;

    case 'sports':
      console.log(
        `Sports event update: ${event.payload.homeTeam} vs ${event.payload.awayTeam} - score ${event.payload.score}`,
      );
      break;
  }

  if (eventCount === 10) {
    await stream.close();
  }
}
