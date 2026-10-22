import {
  type CancelOrdersResponse,
  CancelOrdersResponseSchema,
} from '@polymarket/bindings/clob';
import { WalletType } from '@polymarket/bindings/gamma';
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
import { SignerType } from '../../wallet';
import { optionalExchangeAssetRequestSchema } from '../exchange-asset';
import { mapTradingRestrictionError } from './restrictions';

const CancelOrderRequestSchema = z.object({
  orderId: z.string(),
});

const CancelOrdersRequestSchema = z.object({
  orderIds: z.array(z.string()).min(1).max(3000),
});

const CancelMarketOrdersRequestFieldsSchema = z.object({
  market: z.string().optional(),
});

const CancelMarketOrdersRequestSchema = optionalExchangeAssetRequestSchema(
  CancelMarketOrdersRequestFieldsSchema.shape,
).refine(
  (request) =>
    request.market !== undefined ||
    request.assetId !== undefined ||
    request.tokenId !== undefined,
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
export const CancelOrderError = makeErrorGuard(
  RequestRejectedError,
  RateLimitError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Cancels a single open order placed with this client's credentials.
 * On a Deposit Wallet, the owner can use {@link cancelWalletOrders} for
 * orders placed by session keys.
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

  return cancel(client, '/v1/orders', {
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
 * Cancels multiple open orders placed with this client's credentials.
 * On a Deposit Wallet, the owner can use {@link cancelWalletOrders} for
 * orders placed by session keys.
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

  return cancel(client, '/v1/orders/batch', params.orderIds);
}

function assertDepositWalletOwner(client: BaseSecureClient): void {
  if (
    client.account.walletType !== WalletType.DEPOSIT_WALLET ||
    client.account.signerType !== SignerType.OWNER
  ) {
    throw new UserInputError(
      'Wallet-wide cancellation requires the Deposit Wallet owner.',
    );
  }
}

/** Order hashes to cancel across the Deposit Wallet. */
export type CancelWalletOrdersRequest = { orderIds: string[] };

const CancelWalletOrdersRequestSchema = z.strictObject({
  orderIds: z
    .array(z.string().regex(/^0x[0-9a-fA-F]{64}$/))
    .min(1)
    .max(1000),
});

export type CancelWalletOrdersError =
  | RequestRejectedError
  | RateLimitError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const CancelWalletOrdersError = makeErrorGuard(
  RequestRejectedError,
  RateLimitError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Cancels selected orders across the Deposit Wallet, whichever signer placed them.
 * Only the wallet owner can call this method. Partial failures are returned
 * in `notCanceled`. The request is not split into batches or retried automatically.
 * @throws {@link CancelWalletOrdersError} Thrown on failure.
 * @example
 * ```ts
 * const response = await cancelWalletOrders(client, { orderIds: [orderId] });
 * ```
 */
export async function cancelWalletOrders(
  client: BaseSecureClient,
  request: CancelWalletOrdersRequest,
): Promise<CancelOrdersResponse> {
  assertDepositWalletOwner(client);
  const params = parseUserInput(request, CancelWalletOrdersRequestSchema);
  return cancel(client, '/cancel-wallet-orders', {
    order_ids: params.orderIds,
  });
}

export type CancelAllWalletOrdersError =
  | RequestRejectedError
  | RateLimitError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const CancelAllWalletOrdersError = makeErrorGuard(
  RequestRejectedError,
  RateLimitError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Cancels all open orders across the Deposit Wallet, whichever signer placed them.
 * Only the wallet owner can call this method. Partial failures are returned
 * in `notCanceled`. The request is not retried automatically.
 * @throws {@link CancelAllWalletOrdersError} Thrown on failure.
 * @example
 * ```ts
 * const response = await cancelAllWalletOrders(client);
 * ```
 */
export async function cancelAllWalletOrders(
  client: BaseSecureClient,
): Promise<CancelOrdersResponse> {
  assertDepositWalletOwner(client);
  return cancel(client, '/cancel-wallet-orders', { all: true });
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
 * Cancels all open orders placed with this client's credentials.
 * On a Deposit Wallet, the owner can use {@link cancelAllWalletOrders} to
 * include orders placed by session keys.
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
  return cancel(client, '/v1/orders/all');
}

export type CancelMarketOrdersRequest =
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId?: string;
      tokenId?: never;
      market?: string;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId?: string;
      market?: string;
    };
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
 * or asset filter.
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

  return cancel(client, '/v1/orders/by-market', {
    asset_id: params.assetId ?? params.tokenId,
    market: params.market,
  });
}

async function cancel(
  client: BaseSecureClient,
  path: string,
  payload?: unknown,
): Promise<CancelOrdersResponse> {
  return client.predictions
    .del(path, {
      json: payload,
      rateLimitBucket: 'cancel',
      schema: CancelOrdersResponseSchema,
    })
    .catch((error) => {
      throw mapTradingRestrictionError(error);
    });
}
