import {
  type CancelOrdersResponse,
  CancelOrdersResponseSchema,
} from '@polymarket/bindings/clob';
import { unwrap } from '@polymarket/types';
import { z } from 'zod';
import type { SecureClient } from '../../clients';
import type {
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../../errors';
import { parseUserInput } from '../../input';
import { validateWith } from '../../response';

const CancelOrderRequestSchema = z.object({
  orderId: z.string(),
});

const CancelOrdersRequestSchema = z.object({
  orderIds: z.array(z.string()).min(1).max(3000),
});

const CancelMarketOrdersRequestSchema = z
  .object({
    assetId: z.string().optional(),
    market: z.string().optional(),
  })
  .refine(
    (request) => request.market !== undefined || request.assetId !== undefined,
    {
      message: 'At least one of market or assetId is required.',
      path: ['market'],
    },
  );

export type CancelOrderRequest = z.input<typeof CancelOrderRequestSchema>;

export type CancelOrderError =
  | RequestRejectedError
  | RateLimitError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

/**
 * Cancels a single open order for the authenticated account.
 *
 * @throws {@link CancelOrderError}
 * Thrown on failure.
 */
export async function cancelOrder(
  client: SecureClient,
  request: CancelOrderRequest,
): Promise<CancelOrdersResponse> {
  const params = parseUserInput(request, CancelOrderRequestSchema);

  return cancel(client, '/order', {
    orderID: params.orderId,
  });
}

export type CancelOrdersRequest = z.input<typeof CancelOrdersRequestSchema>;
export type CancelOrdersError =
  | RequestRejectedError
  | RateLimitError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

/**
 * Cancels multiple open orders for the authenticated account.
 *
 * @throws {@link CancelOrdersError}
 * Thrown on failure.
 */
export async function cancelOrders(
  client: SecureClient,
  request: CancelOrdersRequest,
): Promise<CancelOrdersResponse> {
  const params = parseUserInput(request, CancelOrdersRequestSchema);

  return cancel(client, '/orders', params.orderIds);
}

export type CancelAllError =
  | RequestRejectedError
  | RateLimitError
  | SigningError
  | TransportError
  | UnexpectedResponseError;

/**
 * Cancels all open orders for the authenticated account.
 *
 * @throws {@link CancelAllError}
 * Thrown on failure.
 */
export async function cancelAll(
  client: SecureClient,
): Promise<CancelOrdersResponse> {
  return cancel(client, '/cancel-all');
}

export type CancelMarketOrdersRequest = z.input<
  typeof CancelMarketOrdersRequestSchema
>;
export type CancelMarketOrdersError =
  | RequestRejectedError
  | RateLimitError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

/**
 * Cancels all open orders for the authenticated account that match the market
 * or asset filter.
 *
 * @throws {@link CancelMarketOrdersError}
 * Thrown on failure.
 */
export async function cancelMarketOrders(
  client: SecureClient,
  request: CancelMarketOrdersRequest,
): Promise<CancelOrdersResponse> {
  const params = parseUserInput(request, CancelMarketOrdersRequestSchema);

  return cancel(client, '/cancel-market-orders', {
    asset_id: params.assetId,
    market: params.market,
  });
}

async function cancel(
  client: SecureClient,
  path: string,
  payload?: unknown,
): Promise<CancelOrdersResponse> {
  return unwrap(
    client.secureClob
      .del(path, {
        json: payload,
      })
      .andThen(validateWith(CancelOrdersResponseSchema)),
  );
}
