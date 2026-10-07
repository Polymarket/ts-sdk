import { z } from 'zod';

/** Acknowledgement for an order heartbeat; retain the ID for the next send. */
export const OrderHeartbeatSchema = z
  .object({ heartbeat_id: z.string().min(1) })
  .transform(({ heartbeat_id }) => ({ heartbeatId: heartbeat_id }));
export type OrderHeartbeat = z.infer<typeof OrderHeartbeatSchema>;
/** Acknowledgement for a legacy order heartbeat. */
export const LegacyOrderHeartbeatSchema = z.object({ status: z.literal('ok') });
export type LegacyOrderHeartbeat = z.infer<typeof LegacyOrderHeartbeatSchema>;
/** Mismatch rejection carrying the currently expected order heartbeat ID. */
export const OrderHeartbeatMismatchResponseSchema = z.object({
  error_msg: z.literal('Invalid Heartbeat ID'),
  heartbeat_id: z.string(),
});
