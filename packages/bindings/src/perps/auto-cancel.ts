import { z } from 'zod';
import { EpochMillisecondsSchema, toEpochMilliseconds } from '../shared';

// The API reports an unarmed schedule as `deadline: 0`.
const AutoCancelDeadlineSchema = z
  .number()
  .int()
  .transform((value) => (value === 0 ? null : toEpochMilliseconds(value)));

/**
 * Acknowledgement for a Perps auto-cancel update. `deadline` echoes the armed
 * cancellation time in Unix milliseconds, or `null` when the schedule was
 * disarmed.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsAutoCancelResponseSchema = z.object({
  status: z.literal('ok'),
  deadline: AutoCancelDeadlineSchema,
});

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsAutoCancelResponse = z.infer<
  typeof PerpsAutoCancelResponseSchema
>;

/**
 * Current auto-cancel state for an account. `deadline` is `null` when no
 * schedule is armed.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsAutoCancelStatusSchema = z
  .object({
    deadline: AutoCancelDeadlineSchema,
    triggered: z.number().int().nonnegative(),
    daily_limit: z.number().int().nonnegative(),
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
export const FetchPerpsAutoCancelStatusResponseSchema =
  PerpsAutoCancelStatusSchema;
