import { z } from 'zod';
import { EpochMillisecondsSchema } from '../shared';

/**
 * Acknowledgement for a Perps auto-cancel update. `deadline` echoes the armed
 * cancellation time in Unix milliseconds, or `0` when the schedule was
 * cleared.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsAutoCancelResponseSchema = z.object({
  status: z.literal('ok'),
  deadline: EpochMillisecondsSchema,
});

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsAutoCancelResponse = z.infer<
  typeof PerpsAutoCancelResponseSchema
>;

/**
 * Current auto-cancel state for an account. `deadline` is `0` when no
 * schedule is armed.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsAutoCancelStatusSchema = z
  .object({
    deadline: EpochMillisecondsSchema,
    triggered: z.number().int().nonnegative(),
    daily_limit: z.number().int().positive(),
    next_reset: EpochMillisecondsSchema,
  })
  .transform((status) => ({
    deadline: status.deadline,
    triggered: status.triggered,
    dailyLimit: status.daily_limit,
    nextReset: status.next_reset,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsAutoCancelStatus = z.infer<typeof PerpsAutoCancelStatusSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsAutoCancelResponseSchema = PerpsAutoCancelStatusSchema;
