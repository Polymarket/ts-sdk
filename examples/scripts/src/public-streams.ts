import { createPublicClient } from '@polymarket/client';

const client = createPublicClient();
try {
  const stream = await client.subscribe([{ topic: 'sports' }]);
  let eventCount = 0;
  for await (const event of stream) {
    console.log(
      'Sports event update:',
      event.payload.homeTeam,
      'vs',
      event.payload.awayTeam,
      'score',
      event.payload.score,
    );
    if (++eventCount === 10) break;
  }
} finally {
  await client.closeSubscriptions();
}
