import {
  type CancelOrdersResponse,
  CancelOrdersResponseSchema,
} from '@polymarket/bindings/clob';
import { unwrap } from '@polymarket/types';
import { z } from 'zod';
import type { BaseSecureClient } from '../../clients';
import {
  makeErrorGuard,
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
    tokenId: z.string().optional(),
    market: z.string().optional(),
  })
  .refine(
    (request) => request.market !== undefined || request.tokenId !== undefined,
    {
      message: 'At least one of market or tokenId is required.',
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
export const CancelOrderError = makeErrorGuard(
  RequestRejectedError,
  RateLimitError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Cancels a single open order for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link CancelOrderError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const response = await cancelOrder(client, {
 *   orderId: '123',
 * });
 *
 * // response.canceled: OrderId[]
 * ```
 */
export async function cancelOrder(
  client: BaseSecureClient,
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
export const CancelOrdersError = makeErrorGuard(
  RequestRejectedError,
  RateLimitError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Cancels multiple open orders for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link CancelOrdersError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const response = await cancelOrders(client, {
 *   orderIds: ['1', '2'],
 * });
 *
 * // response.canceled: OrderId[]
 * ```
 */
export async function cancelOrders(
  client: BaseSecureClient,
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
export const CancelAllError = makeErrorGuard(
  RequestRejectedError,
  RateLimitError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
);

/**
 * Cancels all open orders for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link CancelAllError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const response = await cancelAll(client);
 *
 * // response.canceled: OrderId[]
 * ```
 */
export async function cancelAll(
  client: BaseSecureClient,
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
export const CancelMarketOrdersError = makeErrorGuard(
  RequestRejectedError,
  RateLimitError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Cancels all open orders for the authenticated account that match the market
 * or token filter.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link CancelMarketOrdersError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const response = await cancelMarketOrders(client, {
 *   market: '0x0000000000000000000000000000000000000000000000000000000000000001',
 * });
 *
 * // response.canceled: OrderId[]
 * ```
 */
export async function cancelMarketOrders(
  client: BaseSecureClient,
  request: CancelMarketOrdersRequest,
): Promise<CancelOrdersResponse> {
  const params = parseUserInput(request, CancelMarketOrdersRequestSchema);

  return cancel(client, '/cancel-market-orders', {
    asset_id: params.tokenId,
    market: params.market,
  });
}

async function cancel(
  client: BaseSecureClient,
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
