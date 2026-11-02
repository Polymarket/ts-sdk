import type { PositionId } from '@polymarket/bindings';
import {
  DirectionalEventIdSchema,
  decodeDirectionalPositionId,
  ThresholdSide,
} from '@polymarket/bindings/protocol';
import { describe, expect, it } from 'vitest';
import {
  bucketRangePositionIds,
  eventYesPositionIds,
  resolveAvailableAmount,
  thresholdBasketPositionIds,
} from './position-baskets';

// Four real buckets; the Void bucket has index 4.
const EVENT_ID = DirectionalEventIdSchema.parse(
  '0x0400112233445566778899aabbccddeeff000400000000000000000102',
);

function bucketIndices(positionIds: readonly PositionId[]): number[] {
  return positionIds.map(
    (positionId) => decodeDirectionalPositionId(positionId).conditionIndex,
  );
}

describe('position baskets', () => {
  it('caps directional splits by collateral as well as every middle bucket', () => {
    const assets = [
      { asset: 'bucket 1', balance: 3_000_000n },
      { asset: 'bucket 2', balance: 2_000_000n },
      { asset: 'pUSD', balance: 500_000n },
    ];
    expect(resolveAvailableAmount(assets, 'max')).toBe(500_000n);
    expect(resolveAvailableAmount(assets, 400_000n)).toBe(400_000n);
    expect(() => resolveAvailableAmount(assets, 1_000_000n)).toThrow(/pUSD/);
    assets[2] = { asset: 'pUSD', balance: 4_000_000n };
    expect(resolveAvailableAmount(assets, 'max')).toBe(2_000_000n);
    assets[1] = { asset: 'bucket 2', balance: 0n };
    expect(() => resolveAvailableAmount(assets, 'max')).toThrow(/bucket 2/);
  });
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
