import { createPublicClient } from '@polymarket/client';
import { requireEnv } from './lib/env';

const client = createPublicClient();

const wallet = requireEnv('POLYMARKET_DEPOSIT_WALLET');
const positions = client.listPositions({
  user: wallet,
  pageSize: 100,
});

const rows = [];

for await (const page of positions) {
  rows.push(
    ...page.items.map((position) => ({
      title: position.title ?? position.slug ?? position.conditionId,
      outcome: position.outcome ?? '',
      size: position.currentSize,
      currentValue: position.currentValue ?? '0',
      avgPrice: position.avgPrice ?? '',
      curPrice: position.currentPrice,
      redeemable: position.redeemable ?? false,
      mergeable: position.mergeable ?? false,
      assetId: position.assetId ?? '',
    })),
  );
}

console.log(`Found ${rows.length} open positions for ${wallet}`);
console.table(rows);
