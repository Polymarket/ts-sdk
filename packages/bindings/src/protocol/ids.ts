import type { HexString, Tagged } from '@polymarket/types';
import { z } from 'zod';
import {
  type ConditionId,
  type PositionId,
  toConditionId,
  toPositionId,
} from '../shared';

/** Module encoded in a structured protocol identifier. */
export enum ProtocolModule {
  Binary = 1,
  NegRisk = 2,
  Combinatorial = 3,
  Directional = 4,
}

/** Side of a directional threshold instrument. */
export enum ThresholdSide {
  Above = 'above',
  Below = 'below',
}

export const ThresholdSideSchema = z.enum(ThresholdSide);

/** Canonical bytes29 onchain event root, distinct from a discovery event ID. */
export type ProtocolEventId = Tagged<HexString, 'ProtocolEventId'>;

const UINT256_MAX = (1n << 256n) - 1n;
const UINT64_MASK = (1n << 64n) - 1n;
const UINT16_MASK = 0xffffn;
const THRESHOLD_FLAG = 0x8000;
const THRESHOLD_INDEX_MASK = 0x7fff;

export type DecodedProtocolEventId = {
  eventId: ProtocolEventId;
  moduleId: ProtocolModule;
  /** Real-condition count. The synthetic fallback has index `arity`. */
  arity: number;
  /** Raw resolution-chain field; preserved without interpreting its meaning. */
  resolutionChain: number;
  /** Reserved identity bits, preserved during derivation. */
  reserved: bigint;
};

export type DecodedProtocolConditionId = {
  eventId: ProtocolEventId;
  moduleId: ProtocolModule;
  arity: number;
  /** Raw uint16 descriptor, including the directional threshold flag. */
  conditionIndex: number;
  resolutionChain: number;
  reserved: bigint;
};

export type DecodedProtocolPositionId = {
  conditionId: ConditionId;
  eventId: ProtocolEventId;
  moduleId: ProtocolModule;
  arity: number;
  conditionIndex: number;
  outcomeIndex: 0 | 1;
  resolutionChain: number;
  reserved: bigint;
};

function isValidConditionDescriptor(
  moduleId: number,
  arity: number,
  conditionIndex: number,
): boolean {
  if (
    moduleId === ProtocolModule.Binary ||
    moduleId === ProtocolModule.Combinatorial
  ) {
    return arity === 0 && conditionIndex === 0;
  }

  if (moduleId === ProtocolModule.NegRisk) {
    return arity >= 2 && conditionIndex <= arity;
  }

  if (
    moduleId === ProtocolModule.Directional &&
    arity >= 2 &&
    arity <= 0x7fff
  ) {
    if ((conditionIndex & THRESHOLD_FLAG) === 0) {
      return conditionIndex <= arity;
    }
    const line = conditionIndex & THRESHOLD_INDEX_MASK;
    return line >= 1 && line < arity;
  }

  return false;
}

function hasValidConditionDescriptor(value: bigint): boolean {
  return isValidConditionDescriptor(
    Number(value >> 248n),
    Number((value >> 104n) & UINT16_MASK),
    Number((value >> 8n) & UINT16_MASK),
  );
}

/**
 * Validates a neg-risk or directional event root and normalizes it to bytes29.
 * A bytes32 representation is accepted only when its final three bytes are zero.
 */
export const ProtocolEventIdSchema = z
  .string()
  .regex(/^0x(?:[0-9a-fA-F]{58}|[0-9a-fA-F]{64})$/)
  .refine(
    (value) => value.length === 60 || value.endsWith('000000'),
    'Expected a canonical event ID',
  )
  .transform((value) => value.slice(0, 60).toLowerCase() as ProtocolEventId)
  .refine((eventId) => {
    const value = BigInt(`${eventId}000000`);
    const moduleId = Number(value >> 248n);
    return (
      (moduleId === ProtocolModule.NegRisk ||
        moduleId === ProtocolModule.Directional) &&
      hasValidConditionDescriptor(value)
    );
  }, 'Expected a supported multi-outcome event ID');

/** Validates a directional event root and normalizes it to bytes29. */
export const DirectionalEventIdSchema = ProtocolEventIdSchema.refine(
  (eventId) =>
    decodeProtocolEventId(eventId).moduleId === ProtocolModule.Directional,
  'Expected a directional protocol event ID',
);

/**
 * Validates a supported structured condition descriptor and normalizes to bytes31.
 * Padded bytes32 inputs must have a zero outcome byte.
 */
export const ProtocolConditionIdSchema = z
  .string()
  .regex(/^0x(?:[0-9a-fA-F]{62}|[0-9a-fA-F]{64})$/)
  .refine(
    (value) => value.length === 64 || value.endsWith('00'),
    'Expected a canonical condition ID',
  )
  .transform((value) => toConditionId(value.slice(0, 64).toLowerCase()))
  .refine(
    (conditionId) => hasValidConditionDescriptor(BigInt(`${conditionId}00`)),
    'Expected a supported protocol condition descriptor',
  );

/** Validates a decimal uint256 structured position ID and its outcome descriptor. */
export const ProtocolPositionIdSchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]{0,77})$/)
  .transform(BigInt)
  .refine((value) => value <= UINT256_MAX, 'Expected a uint256 position ID')
  .refine(
    (value) => (value & 0xffn) <= 1n && hasValidConditionDescriptor(value),
    'Expected a supported protocol position descriptor',
  )
  .transform((value) => toPositionId(value.toString()));

/** Decodes a validated canonical event root without changing its identity fields. */
export function decodeProtocolEventId(
  eventId: ProtocolEventId,
): DecodedProtocolEventId {
  const value = BigInt(`${eventId}000000`);
  return {
    eventId,
    moduleId: Number(value >> 248n) as ProtocolModule,
    arity: Number((value >> 104n) & UINT16_MASK),
    resolutionChain: Number((value >> 24n) & UINT16_MASK),
    reserved: (value >> 40n) & UINT64_MASK,
  };
}

/**
 * Decodes a validated canonical bytes31 condition, preserving reserved and chain fields.
 * The extracted event root clears the entire condition descriptor, including its type flag.
 */
export function decodeProtocolConditionId(
  conditionId: ConditionId,
): DecodedProtocolConditionId {
  const value = BigInt(`${conditionId}00`);
  const eventId = conditionId.slice(0, 60) as ProtocolEventId;
  return {
    ...decodeProtocolEventId(eventId),
    conditionIndex: Number((value >> 8n) & UINT16_MASK),
  };
}

/** Decodes a validated decimal structured position ID. */
export function decodeProtocolPositionId(
  positionId: PositionId,
): DecodedProtocolPositionId {
  const value = BigInt(positionId);
  const conditionId = toConditionId(
    `0x${value.toString(16).padStart(64, '0').slice(0, 62)}`,
  );
  return {
    ...decodeProtocolConditionId(conditionId),
    conditionId,
    outcomeIndex: Number(value & 0xffn) as 0 | 1,
  };
}

/**
 * Derives a condition from a validated event root and a valid uint16 condition descriptor.
 * Directional thresholds use `0x8000 | line` as their descriptor.
 */
export function deriveProtocolConditionId(
  eventId: ProtocolEventId,
  conditionIndex: number,
): ConditionId {
  return toConditionId(
    `${eventId}${conditionIndex.toString(16).padStart(4, '0')}`,
  );
}

/** Derives the threshold condition at a validated ordinal line. */
export function deriveThresholdConditionId(
  eventId: ProtocolEventId,
  line: number,
): ConditionId {
  return deriveProtocolConditionId(eventId, THRESHOLD_FLAG | line);
}

/** Derives one side of the threshold at a validated ordinal line. */
export function deriveThresholdPositionId(
  eventId: ProtocolEventId,
  line: number,
  side: ThresholdSide,
): PositionId {
  return deriveProtocolPositionId(
    deriveThresholdConditionId(eventId, line),
    side === ThresholdSide.Above ? 0 : 1,
  );
}

/** Derives one outcome from a validated canonical bytes31 condition. */
export function deriveProtocolPositionId(
  conditionId: ConditionId,
  outcomeIndex: 0 | 1,
): PositionId {
  return toPositionId(
    (BigInt(`${conditionId}00`) | BigInt(outcomeIndex)).toString(),
  );
}
