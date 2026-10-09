import { describe, expect, it } from 'vitest';
import {
  deriveDirectionalBucketPositions,
  deriveDirectionalThresholdPositions,
} from './directional';
import { UserInputError } from './errors';

// Solidity Ids layout: module, base hash, real-bucket count, reserved, resolution chain.
const EVENT = '0x0400112233445566778899aabbccddeeff00040123456789abcdef0102';

describe('directional position derivation', () => {
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

  it('rejects neg-risk roots and dirty event suffixes at the public input boundary', () => {
    for (const eventId of [
      `0x02${EVENT.slice(4)}`,
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
});
