import {
  type LegacyOrderHeartbeat,
  LegacyOrderHeartbeatSchema,
  type OrderHeartbeat,
  OrderHeartbeatSchema,
} from '@polymarket/bindings/clob';
import { unwrap } from '@polymarket/types';
import { z } from 'zod';
import type { BaseSecureClient } from '../clients';
import {
  makeErrorGuard,
  OrderHeartbeatMismatchError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import { validateWith } from '../response';

const SendOrderHeartbeatRequestSchema = z.object({
  heartbeatId: z.string().default(''),
});
export type SendOrderHeartbeatRequest = z.input<
  typeof SendOrderHeartbeatRequestSchema
>;
export type SendOrderHeartbeatError =
  | OrderHeartbeatMismatchError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const SendOrderHeartbeatError = makeErrorGuard(
  OrderHeartbeatMismatchError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Sends an authenticated order heartbeat and returns the next heartbeat ID.
 * Start with an empty ID, serialize sends, and retain each returned ID. Send every
 * five seconds; missing the ten-second deadline triggers cancellation of this API key's orders.
 * No timer or retry is started. Catch OrderHeartbeatMismatchError and explicitly
 * retry with its heartbeatId. This differs from a WebSocket connection keepalive.
 * @throws {@link SendOrderHeartbeatError} Thrown on failure.
 * @example
 * ```ts
 * const heartbeat = await sendOrderHeartbeat(client);
 * const next = await sendOrderHeartbeat(client, { heartbeatId: heartbeat.heartbeatId });
 * ```
 */
export async function sendOrderHeartbeat(
  client: BaseSecureClient,
  request: SendOrderHeartbeatRequest = {},
): Promise<OrderHeartbeat> {
  const { heartbeatId } = parseUserInput(
    request,
    SendOrderHeartbeatRequestSchema,
  );
  return unwrap(
    client.secureClob
      .post('/v1/heartbeats', {
        json: { heartbeat_id: heartbeatId },
        retry: false,
      })
      .andThen(validateWith(OrderHeartbeatSchema)),
  );
}

export type SendLegacyOrderHeartbeatError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError;
export const SendLegacyOrderHeartbeatError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
);
/**
 * Sends an authenticated legacy order heartbeat without ID tracking.
 * Shares the API key's registration with sendOrderHeartbeat and resets its expected
 * ID to empty. Send every five seconds to avoid timeout cancellation. No timer or retry is started.
 * @throws {@link SendLegacyOrderHeartbeatError} Thrown on failure.
 */
export async function sendLegacyOrderHeartbeat(
  client: BaseSecureClient,
): Promise<LegacyOrderHeartbeat> {
  return unwrap(
    client.secureClob
      .post('/heartbeats', { retry: false })
      .andThen(validateWith(LegacyOrderHeartbeatSchema)),
  );
}
