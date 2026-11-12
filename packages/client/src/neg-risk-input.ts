import { NegRiskEventIdSchema } from '@polymarket/bindings';
import { z } from 'zod';

const ExplicitAmountSchema = z
  .bigint()
  .positive()
  .max((1n << 256n) - 1n);

// ConditionIdLib uses bytes31, with a zero outcome byte in bytes32 form.
// Its first 29 bytes are the event ID and its final 2 bytes are the condition index.
const NegRiskConditionInputSchema = z
  .string()
  .regex(
    /^0x02[0-9a-fA-F]{60}(?:00)?$/,
    'Expected a protocol V2 neg-risk condition ID (bytes31 or zero-padded bytes32)',
  )
  .refine(
    (value) => NegRiskEventIdSchema.safeParse(value.slice(0, 60)).success,
    'Condition ID must encode a valid neg-risk event',
  )
  .refine(
    (value) =>
      Number.parseInt(value.slice(60, 64), 16) <=
      Number.parseInt(value.slice(36, 40), 16),
    'Condition index must be at most the event arity (the Other index)',
  )
  .transform((value) => value.slice(0, 64).toLowerCase());

// The high-level workflow owns condition selection; contradictory protocol
// inputs are rejected rather than silently ignored.
export const NegRiskOperationInputSchema = z.strictObject({
  conditionId: NegRiskConditionInputSchema,
  amount: ExplicitAmountSchema,
});

export const HorizontalOperationInputSchema = z.object({
  protocolEventId: NegRiskEventIdSchema,
  amount: ExplicitAmountSchema,
});

export const ConvertInputSchema = HorizontalOperationInputSchema.extend({
  conditionIndex: z.number().int().min(0).max(65535),
}).refine(
  ({ protocolEventId, conditionIndex }) =>
    conditionIndex <= Number.parseInt(protocolEventId.slice(36, 40), 16),
  {
    path: ['conditionIndex'],
    message:
      'Condition index must be at most the event arity (the Other index)',
  },
);
