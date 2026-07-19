import { OrderType } from '@polymarket/bindings';
import {
  type OrderResponse,
  OrderResponseSchema,
  type OrderResponses,
  OrderResponsesSchema,
} from '@polymarket/bindings/clob';
import { invariant, unwrap } from '@polymarket/types';
import { z } from 'zod';
import type { BaseSecureClient } from '../../clients';
import {
  InsufficientAllowanceError,
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
import type { SignedOrder } from './types';

const PostOrdersRequestSchema = z.array(z.custom<SignedOrder>()).min(1).max(15);

export type PostOrdersRequest = z.input<typeof PostOrdersRequestSchema>;

export type PostOrderError =
  | InsufficientAllowanceError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError;
export const PostOrderError = makeErrorGuard(
  InsufficientAllowanceError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
);

export type PostOrdersError =
  | InsufficientAllowanceError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PostOrdersError = makeErrorGuard(
  InsufficientAllowanceError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Posts a signed order for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const order = await client.createMarketOrder({
 *   amount: 10,
 *   side: OrderSide.BUY,
 *   tokenId: '123',
 * });
 * const response = await postOrder(client)(order);
 * ```
 *
 * @throws {@link PostOrderError}
 * Thrown on failure.
 */
export function postOrder(
  client: BaseSecureClient,
): (order: SignedOrder) => Promise<OrderResponse> {
  return async function postSignedOrder(order: SignedOrder) {
    const payload = createSendOrderPayload(client, order);

    return unwrap(
      client.secureClob
        .post('/order', {
          json: payload,
        })
        .andThen(validateWith(OrderResponseSchema))
        .mapErr(remapInsufficientAllowance),
    );
  };
}

/**
 * Posts multiple signed orders for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * Accepts between 1 and 15 orders, matching the current service limit.
 *
 * @example
 * ```ts
 * const responses = await postOrders(client)([firstSignedOrder, secondSignedOrder]);
 * ```
 *
 * @throws {@link PostOrdersError}
 * Thrown on failure.
 */
export function postOrders(
  client: BaseSecureClient,
): (orders: PostOrdersRequest) => Promise<OrderResponses>;
export function postOrders(
  client: BaseSecureClient,
): (orders: PostOrdersRequest) => Promise<OrderResponses> {
  return async function postSignedOrders(orders: PostOrdersRequest) {
    const validatedOrders = parseUserInput(orders, PostOrdersRequestSchema);
    const payload = validatedOrders.map((order) =>
      createSendOrderPayload(client, order),
    );

    return unwrap(
      client.secureClob
        .post('/orders', {
          json: payload,
        })
        .andThen(validateWith(OrderResponsesSchema))
        .mapErr(remapInsufficientAllowance),
    );
  };
}

/**
 * Translates the service's balance/allowance order rejection into the typed
 * `InsufficientAllowanceError` so consumers never depend on the rejection
 * message.
 */
function remapInsufficientAllowance<TError>(
  error: TError,
): TError | InsufficientAllowanceError {
  if (
    error instanceof RequestRejectedError &&
    error.status === 400 &&
    error.message.includes('allowance is not enough')
  ) {
    return new InsufficientAllowanceError(error.message, {
      cause: error,
      status: error.status,
    });
  }

  return error;
}

function createSendOrderPayload(client: BaseSecureClient, order: SignedOrder) {
  invariant(
    order.postOnly !== true ||
      order.orderType === OrderType.GTC ||
      order.orderType === OrderType.GTD,
    'Post-only orders are only supported for GTC and GTD order types.',
  );

  return {
    deferExec: false,
    order: {
      builder: order.builder,
      expiration: `${order.expiration}`,
      maker: order.maker,
      makerAmount: order.makerAmount,
      metadata: order.metadata,
      salt: Number.parseInt(order.salt, 10),
      side: order.side,
      signature: order.signature,
      signatureType: order.signatureType,
      signer: order.signer,
      takerAmount: order.takerAmount,
      timestamp: order.timestamp,
      tokenId: order.tokenId,
    },
    orderType: order.orderType,
    owner: client.credentials.key,
    ...(order.postOnly === true ? { postOnly: true } : {}),
  };
}
