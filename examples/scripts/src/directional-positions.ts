import {
  decodePositionId,
  deriveDirectionalBucketPositions,
  deriveDirectionalThresholdPositions,
} from '@polymarket/client';

// Protocol event ID of a directional event with four real buckets.
const eventId = '0x0400112233445566778899aabbccddeeff000400000000000000000000';

console.table(deriveDirectionalBucketPositions({ eventId, bucketIndex: 1 }));
console.table(deriveDirectionalThresholdPositions({ eventId, line: 2 }));

const low = deriveDirectionalThresholdPositions({ eventId, line: 1 });
const high = deriveDirectionalThresholdPositions({ eventId, line: 3 });
console.table([
  decodePositionId(low.abovePositionId),
  decodePositionId(high.belowPositionId),
]);

// With a configured, funded client, merge these wings after they settle:
// const merge = await client.mergeDirectional(low.abovePositionId, high.belowPositionId);
// await merge.wait();
// Reverse one pair using the same IDs in either order (six-decimal base units):
// const split = await client.splitDirectional(high.belowPositionId, low.abovePositionId, 1_000_000n);
// await split.wait();
// Omitted amount or 'max' uses fresh maximum balances. This example stays offline.
