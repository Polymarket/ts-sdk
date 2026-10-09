import type { HexString, Tagged } from '@polymarket/types';
import { z } from 'zod';
import {
  type ConditionId,
  type PositionId,
  toConditionId,
  toPositionId,
} from '../shared';

/** Side of a directional threshold instrument. */
export enum ThresholdSide {
  Above = 'above',
  Below = 'below',
}

export const ThresholdSideSchema = z.enum(ThresholdSide);

/** Canonical bytes29 protocol event ID of a directional event. */
export type DirectionalEventId = Tagged<HexString, 'DirectionalEventId'>;

const DIRECTIONAL_MODULE_ID = 4;
const UINT256_MAX = (1n << 256n) - 1n;
const UINT16_MASK = 0xffffn;
const RESERVED_BITS_MASK = ((1n << 64n) - 1n) << 40n;
const THRESHOLD_FLAG = 0x8000;
const THRESHOLD_INDEX_MASK = 0x7fff;
const MAX_BUCKET_COUNT = 0x7fff;

export type DecodedDirectionalEventId = {
  /** Number of real buckets. The Void bucket has index `bucketCount`. */
  bucketCount: number;
};

export type DecodedDirectionalConditionId = {
  eventId: DirectionalEventId;
  /** Number of real buckets. The Void bucket has index `bucketCount`. */
  bucketCount: number;
  /** Raw uint16 descriptor, including the threshold flag. */
  conditionIndex: number;
};

export type DecodedDirectionalPositionId = DecodedDirectionalConditionId & {
  conditionId: ConditionId;
  outcomeIndex: 0 | 1;
};

function bucketCountOf(value: bigint): number {
  return Number((value >> 104n) & UINT16_MASK);
}

// `value` is the 32-byte position-ID layout. Reserved bits 40-103 must be zero.
function isDirectionalIdentity(value: bigint): boolean {
  const bucketCount = bucketCountOf(value);
  return (
    Number(value >> 248n) === DIRECTIONAL_MODULE_ID &&
    (value & RESERVED_BITS_MASK) === 0n &&
    bucketCount >= 2 &&
    bucketCount <= MAX_BUCKET_COUNT
  );
}

function hasDirectionalConditionDescriptor(value: bigint): boolean {
  if (!isDirectionalIdentity(value)) return false;

  const bucketCount = bucketCountOf(value);
  const conditionIndex = Number((value >> 8n) & UINT16_MASK);
  if ((conditionIndex & THRESHOLD_FLAG) === 0) {
    return conditionIndex <= bucketCount;
  }
  const line = conditionIndex & THRESHOLD_INDEX_MASK;
  return line >= 1 && line < bucketCount;
}

/**
 * Validates a directional event ID and normalizes it to bytes29.
 * A bytes32 representation is accepted only when its final three bytes are zero.
 */
export const DirectionalEventIdSchema = z
  .string()
  .regex(/^0x(?:[0-9a-fA-F]{58}|[0-9a-fA-F]{64})$/)
  .refine(
    (value) => value.length === 60 || value.endsWith('000000'),
    'Expected a canonical event ID',
  )
  .transform((value) => value.slice(0, 60).toLowerCase() as DirectionalEventId)
  .refine(
    (eventId) => isDirectionalIdentity(BigInt(`${eventId}000000`)),
    'Expected a directional event ID',
  );

/**
 * Validates a directional bucket, Void, or threshold condition and normalizes
 * it to bytes31. Padded bytes32 inputs must have a zero outcome byte.
 */
export const DirectionalConditionIdSchema = z
  .string()
  .regex(/^0x(?:[0-9a-fA-F]{62}|[0-9a-fA-F]{64})$/)
  .refine(
    (value) => value.length === 64 || value.endsWith('00'),
    'Expected a canonical condition ID',
  )
  .transform((value) => toConditionId(value.slice(0, 64).toLowerCase()))
  .refine(
    (conditionId) =>
      hasDirectionalConditionDescriptor(BigInt(`${conditionId}00`)),
    'Expected a directional condition ID',
  );

/** Validates a decimal directional bucket, Void, or threshold position ID. */
export const DirectionalPositionIdSchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]{0,77})$/)
  .transform(BigInt)
  .refine((value) => value <= UINT256_MAX, 'Expected a uint256 position ID')
  .refine(
    (value) =>
      (value & 0xffn) <= 1n && hasDirectionalConditionDescriptor(value),
    'Expected a directional position ID',
  )
  .transform((value) => toPositionId(value.toString()));

/** Decodes a validated directional event ID. */
export function decodeDirectionalEventId(
  eventId: DirectionalEventId,
): DecodedDirectionalEventId {
  return { bucketCount: bucketCountOf(BigInt(`${eventId}000000`)) };
}

/** Decodes a validated bytes31 directional condition ID. */
export function decodeDirectionalConditionId(
  conditionId: ConditionId,
): DecodedDirectionalConditionId {
  const value = BigInt(`${conditionId}00`);
  return {
    eventId: conditionId.slice(0, 60) as DirectionalEventId,
    bucketCount: bucketCountOf(value),
    conditionIndex: Number((value >> 8n) & UINT16_MASK),
  };
}

/** Decodes a validated decimal directional position ID. */
export function decodeDirectionalPositionId(
  positionId: PositionId,
): DecodedDirectionalPositionId {
  const value = BigInt(positionId);
  const conditionId = toConditionId(
    `0x${value.toString(16).padStart(64, '0').slice(0, 62)}`,
  );
  return {
    ...decodeDirectionalConditionId(conditionId),
    conditionId,
    outcomeIndex: Number(value & 0xffn) as 0 | 1,
  };
}

/**
 * Derives the bucket condition at a validated index. Index `bucketCount` is
 * the Void bucket.
 */
export function deriveBucketConditionId(
  eventId: DirectionalEventId,
  bucketIndex: number,
): ConditionId {
  return deriveConditionId(eventId, bucketIndex);
}

/** Derives the threshold condition at a validated ordinal line. */
export function deriveThresholdConditionId(
  eventId: DirectionalEventId,
  line: number,
): ConditionId {
  return deriveConditionId(eventId, THRESHOLD_FLAG | line);
}

/** Derives one side of the threshold at a validated ordinal line. */
export function deriveThresholdPositionId(
  eventId: DirectionalEventId,
  line: number,
  side: ThresholdSide,
): PositionId {
  return deriveOutcomePositionId(
    deriveThresholdConditionId(eventId, line),
    side === ThresholdSide.Above ? 0 : 1,
  );
}

/**
 * Derives one outcome of a validated bytes31 directional condition. Outcome 0
 * is YES or ABOVE; outcome 1 is NO or BELOW.
 */
export function deriveOutcomePositionId(
  conditionId: ConditionId,
  outcomeIndex: 0 | 1,
): PositionId {
  return toPositionId(
    (BigInt(`${conditionId}00`) | BigInt(outcomeIndex)).toString(),
  );
}

function deriveConditionId(
  eventId: DirectionalEventId,
  conditionIndex: number,
): ConditionId {
  return toConditionId(
    `${eventId}${conditionIndex.toString(16).padStart(4, '0')}`,
  );
}
