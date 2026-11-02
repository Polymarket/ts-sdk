import { describe, expect, it } from 'vitest';
import { directionalPairsFromHoldings } from './actions/directional-pairs';
import {
  decodePositionId,
  deriveDirectionalBucketPositions,
  deriveDirectionalThresholdPositions,
} from './directional';
import { UserInputError } from './errors';
import { isV2PositionId } from './protocol';

// Ids.sol layout: module, base hash, bucket count, reserved (zero), resolution chain.
const EVENT = '0x0400112233445566778899aabbccddeeff000400000000000000000102';

describe('directional position derivation', () => {
  it('finds only same-event ABOVE-low / BELOW-high pairs and sizes each independently', () => {
    const low = deriveDirectionalThresholdPositions({
      eventId: EVENT,
      line: 1,
    });
    const high = deriveDirectionalThresholdPositions({
      eventId: EVENT,
      line: 3,
    });
    const otherEvent = `0x040111${EVENT.slice(8)}`;
    const other = deriveDirectionalThresholdPositions({
      eventId: otherEvent,
      line: 3,
    });
    const bucket = deriveDirectionalBucketPositions({
      eventId: EVENT,
      bucketIndex: 2,
    });
    const pairs = directionalPairsFromHoldings([
      { positionId: low.abovePositionId, balance: 2_000_000n },
      { positionId: low.belowPositionId, balance: 9_000_000n },
      { positionId: high.abovePositionId, balance: 9_000_000n },
      { positionId: high.belowPositionId, balance: 1_000_000n },
      { positionId: other.belowPositionId, balance: 9_000_000n },
      { positionId: bucket.yesPositionId, balance: 9_000_000n },
    ]);
    expect(pairs).toEqual([
      {
        eventId: EVENT,
        lowLine: 1,
        highLine: 3,
        abovePositionId: low.abovePositionId,
        belowPositionId: high.belowPositionId,
        amount: 1_000_000n,
        expectedPusd: 1_000_000n,
      },
    ]);
  });
  it('decodes usable line indices and economic sides, including Void', () => {
    const low = deriveDirectionalThresholdPositions({
      eventId: EVENT,
      line: 1,
    });
    const high = deriveDirectionalThresholdPositions({
      eventId: EVENT,
      line: 3,
    });
    expect(decodePositionId(low.abovePositionId)).toMatchObject({
      moduleId: 4,
      eventId: EVENT,
      bucketCount: 4,
      kind: 'line',
      index: 1,
      side: 'above',
    });
    expect(decodePositionId(high.belowPositionId)).toMatchObject({
      kind: 'line',
      index: 3,
      side: 'below',
    });
    for (const [bucketIndex, kind] of [
      [2, 'bucket'],
      [4, 'void'],
    ] as const) {
      const bucket = deriveDirectionalBucketPositions({
        eventId: EVENT,
        bucketIndex,
      });
      expect(decodePositionId(bucket.noPositionId)).toMatchObject({
        kind,
        index: bucketIndex,
        side: 'no',
      });
    }
    expect(() => decodePositionId('123')).toThrow(UserInputError);
  });
  it('returns complementary Void positions and preserves the complete event identity', () => {
    const positions = deriveDirectionalBucketPositions({
      eventId: `${EVENT.toUpperCase().replace('0X', '0x')}000000`,
      bucketIndex: 4,
    });
    expect(positions).toEqual({
      conditionId: `${EVENT}0004`,
      yesPositionId: BigInt(`${EVENT}000400`).toString(),
      noPositionId: BigInt(`${EVENT}000401`).toString(),
    });
    expect(() =>
      deriveDirectionalBucketPositions({ eventId: EVENT, bucketIndex: 5 }),
    ).toThrow(/bucketIndex/);
  });

  it('returns ABOVE and BELOW without exposing the threshold flag as a consumer input', () => {
    expect(
      deriveDirectionalThresholdPositions({ eventId: EVENT, line: 2 }),
    ).toEqual({
      conditionId: `${EVENT}8002`,
      abovePositionId: BigInt(`${EVENT}800200`).toString(),
      belowPositionId: BigInt(`${EVENT}800201`).toString(),
    });
    for (const line of [0, 4, 0x8002]) {
      expect(() =>
        deriveDirectionalThresholdPositions({ eventId: EVENT, line }),
      ).toThrow(/line/);
    }
  });

  it('rejects non-directional roots, non-zero reserved bits, and dirty suffixes', () => {
    for (const eventId of [
      `0x02${EVENT.slice(4)}`,
      `${EVENT.slice(0, 40)}0000000000000001${EVENT.slice(56)}`,
      `${EVENT}000001`,
      `${EVENT}800200`,
    ]) {
      expect(() =>
        deriveDirectionalBucketPositions({ eventId, bucketIndex: 0 }),
      ).toThrow(UserInputError);
      expect(() =>
        deriveDirectionalThresholdPositions({ eventId, line: 1 }),
      ).toThrow(UserInputError);
    }
  });

  it('derives IDs that order routing classifies as V2', () => {
    const bucket = deriveDirectionalBucketPositions({
      eventId: EVENT,
      bucketIndex: 4,
    });
    const threshold = deriveDirectionalThresholdPositions({
      eventId: EVENT,
      line: 2,
    });
    for (const positionId of [
      bucket.yesPositionId,
      bucket.noPositionId,
      threshold.abovePositionId,
      threshold.belowPositionId,
    ]) {
      expect(isV2PositionId(positionId)).toBe(true);
    }
  });
});
