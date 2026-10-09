import {
  deriveDirectionalBucketPositions,
  deriveDirectionalThresholdPositions,
} from '@polymarket/client';

// Protocol event ID of a directional event with four real buckets.
const eventId = '0x0400112233445566778899aabbccddeeff000400000000000000000000';

console.table(deriveDirectionalBucketPositions({ eventId, bucketIndex: 1 }));
console.table(deriveDirectionalThresholdPositions({ eventId, line: 2 }));
