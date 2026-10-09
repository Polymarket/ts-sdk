import type { PositionId } from '@polymarket/bindings';
import {
  decodeProtocolPositionId,
  ProtocolEventIdSchema,
  ThresholdSide,
} from '@polymarket/bindings/protocol';
import { describe, expect, it } from 'vitest';
import {
  bucketRangePositionIds,
  eventYesPositionIds,
  thresholdBasketPositionIds,
} from './position-baskets';

// Four real buckets; the Void bucket has index 4.
const EVENT_ID = ProtocolEventIdSchema.parse(
  '0x0400112233445566778899aabbccddeeff00040123456789abcdef0102',
);

function bucketIndices(positionIds: readonly PositionId[]): number[] {
  return positionIds.map(
    (positionId) => decodeProtocolPositionId(positionId).conditionIndex,
  );
}

describe('position baskets', () => {
  it('includes Void only in the event set and BELOW baskets', () => {
    expect(bucketIndices(eventYesPositionIds(EVENT_ID))).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(
      bucketIndices(
        thresholdBasketPositionIds(EVENT_ID, 2, ThresholdSide.Above),
      ),
    ).toEqual([2, 3]);
    expect(
      bucketIndices(
        thresholdBasketPositionIds(EVENT_ID, 2, ThresholdSide.Below),
      ),
    ).toEqual([0, 1, 4]);
    expect(bucketIndices(bucketRangePositionIds(EVENT_ID, 1, 3))).toEqual([
      1, 2,
    ]);
  });
});
