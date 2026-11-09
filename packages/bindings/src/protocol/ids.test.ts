import { describe, expect, it } from 'vitest';
import {
  DirectionalConditionIdSchema,
  DirectionalEventIdSchema,
  DirectionalPositionIdSchema,
  decodeDirectionalConditionId,
  decodeDirectionalEventId,
  decodeDirectionalPositionId,
  deriveBucketConditionId,
  deriveOutcomePositionId,
  deriveThresholdConditionId,
  deriveThresholdPositionId,
  ThresholdSide,
} from './ids';

// Ids.sol layout: module | base hash | bucket count | reserved (zero) | resolution chain.
const EVENT = '0x0400112233445566778899aabbccddeeff000400000000000000000102';
const BUCKET = `${EVENT}0003`;
const VOID = `${EVENT}0004`;
const THRESHOLD = `${EVENT}8002`;

function withBucketCount(bucketCount: string): string {
  return `${EVENT.slice(0, 36)}${bucketCount}${EVENT.slice(40)}`;
}

function decimalPosition(conditionId: string, outcome: number): string {
  return BigInt(
    `${conditionId}${outcome.toString(16).padStart(2, '0')}`,
  ).toString();
}

describe('directional protocol IDs', () => {
  it('normalizes canonical widths while rejecting dirty suffix bytes', () => {
    expect(
      DirectionalEventIdSchema.parse(
        `${EVENT.toUpperCase().replace('0X', '0x')}000000`,
      ),
    ).toBe(EVENT);
    expect(DirectionalConditionIdSchema.parse(`${THRESHOLD}00`)).toBe(
      THRESHOLD,
    );
    for (const eventId of [`${EVENT}800200`, `${EVENT}000001`]) {
      expect(DirectionalEventIdSchema.safeParse(eventId).success).toBe(false);
    }
    expect(
      DirectionalConditionIdSchema.safeParse(`${THRESHOLD}01`).success,
    ).toBe(false);
  });

  it('preserves the event identity through bucket, Void and threshold derivation', () => {
    const eventId = DirectionalEventIdSchema.parse(EVENT);
    expect(decodeDirectionalEventId(eventId)).toEqual({ bucketCount: 4 });
    for (const [condition, conditionId] of [
      [BUCKET, deriveBucketConditionId(eventId, 3)],
      [VOID, deriveBucketConditionId(eventId, 4)],
      [THRESHOLD, deriveThresholdConditionId(eventId, 2)],
    ] as const) {
      expect(conditionId).toBe(condition);
      expect(DirectionalConditionIdSchema.parse(conditionId)).toBe(condition);
      expect(decodeDirectionalConditionId(conditionId)).toEqual({
        eventId: EVENT,
        bucketCount: 4,
        conditionIndex: Number.parseInt(condition.slice(-4), 16),
      });
      for (const outcome of [0, 1] as const) {
        const positionId = deriveOutcomePositionId(conditionId, outcome);
        expect(positionId).toBe(decimalPosition(condition, outcome));
        expect(DirectionalPositionIdSchema.parse(positionId)).toBe(positionId);
        expect(decodeDirectionalPositionId(positionId)).toMatchObject({
          conditionId: condition,
          eventId: EVENT,
          outcomeIndex: outcome,
        });
      }
    }
    expect(deriveThresholdPositionId(eventId, 2, ThresholdSide.Below)).toBe(
      decimalPosition(THRESHOLD, 1),
    );
  });

  it('enforces bucket-count and descriptor bounds', () => {
    const minimum = withBucketCount('0002');
    const maximum = withBucketCount('7fff');
    for (const condition of [
      `${minimum}0002`,
      `${minimum}8001`,
      `${maximum}7fff`,
      `${maximum}fffe`,
    ]) {
      expect(
        DirectionalConditionIdSchema.safeParse(condition).success,
        condition,
      ).toBe(true);
    }
    for (const condition of [
      `${withBucketCount('0001')}0000`,
      `${withBucketCount('8000')}0000`,
      `${minimum}0003`,
      `${minimum}8000`,
      `${minimum}8002`,
      `${maximum}ffff`,
    ]) {
      expect(
        DirectionalConditionIdSchema.safeParse(condition).success,
        condition,
      ).toBe(false);
    }
  });

  it('rejects other modules and non-zero reserved bits', () => {
    const reserved = `${EVENT.slice(0, 40)}0000000000000001${EVENT.slice(56)}`;
    for (const eventId of [`0x02${EVENT.slice(4)}`, reserved]) {
      expect(DirectionalEventIdSchema.safeParse(eventId).success).toBe(false);
    }
    for (const condition of [
      `0x01${BUCKET.slice(4)}`,
      `0x02${BUCKET.slice(4)}`,
      `0x03${BUCKET.slice(4)}`,
      `${reserved}0003`,
    ]) {
      expect(
        DirectionalConditionIdSchema.safeParse(condition).success,
        condition,
      ).toBe(false);
      expect(
        DirectionalPositionIdSchema.safeParse(decimalPosition(condition, 0))
          .success,
        condition,
      ).toBe(false);
    }
  });

  it('strictly rejects malformed uint256 values and outcome descriptors', () => {
    for (const value of [
      '',
      '-1',
      '+1',
      '01',
      ' 1 ',
      '1.0',
      '1e3',
      '0xff',
      (1n << 256n).toString(),
      decimalPosition(THRESHOLD, 2),
    ]) {
      expect(DirectionalPositionIdSchema.safeParse(value).success, value).toBe(
        false,
      );
    }
  });
});
