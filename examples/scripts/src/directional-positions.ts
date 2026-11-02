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
