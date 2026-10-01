import { NegRiskEventIdSchema } from '@polymarket/bindings';
import { z } from 'zod';

// Shared by the independently public action and ABI-helper input boundaries.
export const HorizontalOperationInputSchema = z.object({
  eventId: NegRiskEventIdSchema,
  amount: z
    .bigint()
    .positive()
    .max((1n << 256n) - 1n),
});

export const ConvertInputSchema = HorizontalOperationInputSchema.extend({
  conditionIndex: z.number().int().min(0).max(65535),
}).refine(
  ({ eventId, conditionIndex }) =>
    conditionIndex <= Number.parseInt(eventId.slice(36, 40), 16),
  {
    path: ['conditionIndex'],
    message:
      'Condition index must be at most the event arity (the Other index)',
  },
);
