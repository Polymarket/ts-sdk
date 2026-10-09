import type { ConditionId, PositionId } from '@polymarket/bindings';
import {
  DirectionalEventIdSchema,
  decodeProtocolEventId,
  deriveProtocolConditionId,
  deriveProtocolPositionId,
  deriveThresholdConditionId,
  type ProtocolEventId,
} from '@polymarket/bindings/protocol';
import { z } from 'zod';
import { makeErrorGuard, UserInputError } from './errors';
import { parseUserInput } from './input';

/** Complementary YES/NO positions for a real bucket or the synthetic Void bucket. */
export type DirectionalBucketPositions = {
  conditionId: ConditionId;
  yesPositionId: PositionId;
  noPositionId: PositionId;
};

/** Parameters for deriving one directional bucket's complementary positions. */
export type DeriveDirectionalBucketPositionsRequest = {
  /** Protocol event ID of a directional event. Not the numeric ID of an `Event`. */
  eventId: string | ProtocolEventId;
  /** Real bucket ordinal in [0, B-1], or B for Void. */
  bucketIndex: number;
};

const DeriveDirectionalBucketPositionsRequestSchema = z
  .object({
    eventId: DirectionalEventIdSchema,
    bucketIndex: z.number().int().min(0),
  })
  .superRefine((params, ctx) => {
    if (params.bucketIndex > decodeProtocolEventId(params.eventId).arity) {
      ctx.addIssue({
        code: 'custom',
        path: ['bucketIndex'],
        message: 'Expected a real bucket index or the Void index',
      });
    }
  }) satisfies z.ZodType<DeriveDirectionalBucketPositionsRequest>;

export type DeriveDirectionalBucketPositionsError = UserInputError;
export const DeriveDirectionalBucketPositionsError =
  makeErrorGuard(UserInputError);

/**
 * Derives one bucket's complementary position IDs without a network request.
 *
 * The real-bucket count is encoded in the event ID; the bucket at that count is
 * Void. These protocol IDs may identify unlisted positions.
 *
 * @throws {@link DeriveDirectionalBucketPositionsError}
 * Thrown when input is invalid.
 */
export function deriveDirectionalBucketPositions(
  request: DeriveDirectionalBucketPositionsRequest,
): DirectionalBucketPositions {
  const params = parseUserInput(
    request,
    DeriveDirectionalBucketPositionsRequestSchema,
  );
  const conditionId = deriveProtocolConditionId(
    params.eventId,
    params.bucketIndex,
  );
  return {
    conditionId,
    yesPositionId: deriveProtocolPositionId(conditionId, 0),
    noPositionId: deriveProtocolPositionId(conditionId, 1),
  };
}

/** Complementary ABOVE/BELOW positions at one ordinal threshold line. */
export type DirectionalThresholdPositions = {
  conditionId: ConditionId;
  abovePositionId: PositionId;
  belowPositionId: PositionId;
};

/** Parameters for deriving one directional threshold's complementary positions. */
export type DeriveDirectionalThresholdPositionsRequest = {
  /** Protocol event ID of a directional event. Not the numeric ID of an `Event`. */
  eventId: string | ProtocolEventId;
  /** Ordinal line in [1, real-bucket count - 1]; not a scalar value. */
  line: number;
};

const DeriveDirectionalThresholdPositionsRequestSchema = z
  .object({
    eventId: DirectionalEventIdSchema,
    line: z.number().int().min(1),
  })
  .superRefine((params, ctx) => {
    if (params.line >= decodeProtocolEventId(params.eventId).arity) {
      ctx.addIssue({
        code: 'custom',
        path: ['line'],
        message: 'Expected a line below the real-bucket count',
      });
    }
  }) satisfies z.ZodType<DeriveDirectionalThresholdPositionsRequest>;

export type DeriveDirectionalThresholdPositionsError = UserInputError;
export const DeriveDirectionalThresholdPositionsError =
  makeErrorGuard(UserInputError);

/**
 * Derives ABOVE/BELOW position IDs without a network request.
 *
 * ABOVE pays the summed real-bucket YES mass at or past the line. BELOW pays
 * the complementary mass, including Void. Lines are ordinal indices. These
 * protocol IDs may identify unlisted positions.
 *
 * @throws {@link DeriveDirectionalThresholdPositionsError}
 * Thrown when input is invalid.
 */
export function deriveDirectionalThresholdPositions(
  request: DeriveDirectionalThresholdPositionsRequest,
): DirectionalThresholdPositions {
  const params = parseUserInput(
    request,
    DeriveDirectionalThresholdPositionsRequestSchema,
  );
  const conditionId = deriveThresholdConditionId(params.eventId, params.line);
  return {
    conditionId,
    abovePositionId: deriveProtocolPositionId(conditionId, 0),
    belowPositionId: deriveProtocolPositionId(conditionId, 1),
  };
}
