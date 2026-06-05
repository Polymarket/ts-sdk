import { OrderSide } from '@polymarket/bindings';
import type { OrderResponse } from '@polymarket/bindings/clob';
import { AssetType } from '@polymarket/bindings/clob';
import type { BaseSecureClient } from '../../clients';
import {
  CancelledSigningError,
  InsufficientLiquidityError,
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../../errors';
import { completeWith } from '../../workflow';
import { updateBalanceAllowance } from '../account';
import { approveErc20, approveErc1155ForAll } from '../approvals';
import { fetchNegRisk } from '../clob';
import { resolveCurrentAllowance } from './allowance';
import { resolveExchangeAddress } from './context';
import { type PostOrderError, postOrder } from './post';
import {
  type PrepareLimitOrderError,
  type PrepareMarketOrderError,
  prepareLimitOrder,
  prepareMarketOrder,
} from './prepare';
import type {
  PrepareLimitOrderRequest,
  PrepareMarketOrderRequest,
  SignedOrder,
} from './types';

export type CreateMarketOrderError =
  | PrepareMarketOrderError
  | CancelledSigningError;
export const CreateMarketOrderError = makeErrorGuard(
  CancelledSigningError,
  InsufficientLiquidityError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Creates a signed market order for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link CreateMarketOrderError}
 * Thrown on failure.
 */
export function createMarketOrder(
  client: BaseSecureClient,
  request: PrepareMarketOrderRequest,
): Promise<SignedOrder> {
  return prepareMarketOrder(client, request).then(completeWith(client.signer));
}

export type PlaceMarketOrderError =
  | CreateMarketOrderError
  | PostOrderError
  | TimeoutError
  | TransactionFailedError;
export const PlaceMarketOrderError = makeErrorGuard(
  CancelledSigningError,
  InsufficientLiquidityError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Creates and posts a market order for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link PlaceMarketOrderError}
 * Thrown on failure.
 */
export function placeMarketOrder(
  client: BaseSecureClient,
  request: PrepareMarketOrderRequest,
): Promise<OrderResponse> {
  return createMarketOrder(client, request).then((order) =>
    postOrderWithAllowanceRecovery(client, order),
  );
}

export type CreateLimitOrderError =
  | PrepareLimitOrderError
  | CancelledSigningError;
export const CreateLimitOrderError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Creates a signed limit order for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * GTD expirations must be at least 60 seconds in the future. Add your own
 * buffer for network latency and clock skew when deriving an expiration from
 * the current time.
 *
 * @throws {@link CreateLimitOrderError}
 * Thrown on failure.
 */
export function createLimitOrder(
  client: BaseSecureClient,
  request: PrepareLimitOrderRequest,
): Promise<SignedOrder> {
  return prepareLimitOrder(client, request).then(completeWith(client.signer));
}

export type PlaceLimitOrderError =
  | CreateLimitOrderError
  | PostOrderError
  | TimeoutError
  | TransactionFailedError;
export const PlaceLimitOrderError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Creates and posts a limit order for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * GTD expirations must be at least 60 seconds in the future. Add your own
 * buffer for network latency and clock skew when deriving an expiration from
 * the current time.
 *
 * @throws {@link PlaceLimitOrderError}
 * Thrown on failure.
 */
export function placeLimitOrder(
  client: BaseSecureClient,
  request: PrepareLimitOrderRequest,
): Promise<OrderResponse> {
  return createLimitOrder(client, request).then((order) =>
    postOrderWithAllowanceRecovery(client, order),
  );
}

async function postOrderWithAllowanceRecovery(
  client: BaseSecureClient,
  order: SignedOrder,
): Promise<OrderResponse> {
  const postSignedOrder = postOrder(client);

  try {
    return await postSignedOrder(order);
  } catch (error) {
    if (!isBalanceOrAllowanceRequestRejection(error)) {
      throw error;
    }

    const retryResponse = await approveOrderAndRetry(
      client,
      order,
      postSignedOrder,
    );

    if (retryResponse === undefined) {
      throw error;
    }

    return retryResponse;
  }
}

async function approveOrderAndRetry(
  client: BaseSecureClient,
  order: SignedOrder,
  postSignedOrder: (order: SignedOrder) => Promise<OrderResponse>,
): Promise<OrderResponse | undefined> {
  const approved = await ensureOrderApproval(client, order);

  return approved ? postSignedOrder(order) : undefined;
}

function isBalanceOrAllowanceRequestRejection(
  error: unknown,
): error is RequestRejectedError {
  return (
    error instanceof RequestRejectedError &&
    error.status === 400 &&
    error.message.includes('allowance is not enough')
  );
}

async function ensureOrderApproval(
  client: BaseSecureClient,
  order: SignedOrder,
): Promise<boolean> {
  const negRisk = await fetchNegRisk(client, { tokenId: order.tokenId });
  const exchangeAddress = resolveExchangeAddress(client, negRisk);
  const requiredAllowance = BigInt(order.makerAmount);
  const currentAllowance = await resolveCurrentAllowance(client, {
    spenderAddress: exchangeAddress,
    side: order.side,
    tokenId: order.tokenId,
  });

  if (currentAllowance >= requiredAllowance) {
    return false;
  }

  const handle =
    order.side === OrderSide.BUY
      ? await approveErc20(client, {
          amount: 'max',
          spenderAddress: exchangeAddress,
          tokenAddress: client.environment.collateralToken,
        })
      : await approveErc1155ForAll(client, {
          operatorAddress: exchangeAddress,
          tokenAddress: client.environment.conditionalTokens,
        });

  await handle.wait();

  await updateBalanceAllowance(client, {
    assetType:
      order.side === OrderSide.BUY
        ? AssetType.COLLATERAL
        : AssetType.CONDITIONAL,
    tokenId: order.side === OrderSide.SELL ? order.tokenId : undefined,
  });

  return true;
}
