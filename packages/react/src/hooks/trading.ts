import type {
  BaseSecureClient,
  CancelledSigningError,
  CancelOrdersResponse,
  OrderResponse,
  SignOrderRequest,
} from '@polymarket/client';
import type {
  CancelOrderError,
  CancelOrderRequest,
  PostOrderError,
  PrepareLimitOrderPostingError,
  PrepareLimitOrderRequest,
  PrepareMarketOrderPostingError,
  PrepareMarketOrderRequest,
} from '@polymarket/client/actions';
import {
  cancelOrder,
  prepareLimitOrderPosting,
  prepareMarketOrderPosting,
} from '@polymarket/client/actions';
import { useCallback, useRef } from 'react';
import type { UnauthenticatedError } from '../errors';
import type { WorkflowHandler } from '../workflow';
import { driveWorkflow } from '../workflow';
import type { WorkflowWriteResult, WriteResult } from '../write';
import { useSecureWrite } from '../write';

/**
 * Workflow step kinds an order placement can surface.
 */
export type PlaceOrderStep = 'signOrder';

export type UsePlaceMarketOrderError =
  | PrepareMarketOrderPostingError
  | PostOrderError
  | CancelledSigningError
  | UnauthenticatedError;

export type UsePlaceMarketOrderResult = [
  placeMarketOrder: (
    request: PrepareMarketOrderRequest,
  ) => Promise<OrderResponse>,
  state: WorkflowWriteResult<
    OrderResponse,
    UsePlaceMarketOrderError,
    PlaceOrderStep
  >,
];

/**
 * Places a market order for the session account through the workflow handler.
 *
 * @remarks
 * Signing flows through the handler; `step` reports `'signOrder'` while the
 * wallet is being asked. There is no automatic allowance recovery: a rejection
 * for insufficient balance or allowance surfaces as `InsufficientAllowanceError`,
 * and the integrator decides how to recover, such as running
 * `useSetupTradingApprovals`. Failures surface on `error` and also reject the
 * returned promise; errors thrown by the workflow handler itself are
 * rethrown as-is. A response with `success: false` is a data-level rejection,
 * not an error.
 *
 * @example
 * ```tsx
 * const handler = useWorkflowHandler(walletClient);
 * const [placeOrder, { status, step, error }] = usePlaceMarketOrder(handler);
 *
 * return (
 *   <button
 *     disabled={status === 'pending'}
 *     onClick={() => placeOrder({ amount: 50, side: OrderSide.BUY, tokenId })}
 *   >
 *     {step === 'signOrder' ? 'Confirm in wallet…' : 'Buy'}
 *   </button>
 * );
 * ```
 */
export function usePlaceMarketOrder(
  handler: WorkflowHandler<SignOrderRequest>,
): UsePlaceMarketOrderResult {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const run = useCallback(
    async (
      client: BaseSecureClient,
      onStep: (kind: PlaceOrderStep) => void,
      request: PrepareMarketOrderRequest,
    ) => {
      const workflow = await prepareMarketOrderPosting(client, request);

      return driveWorkflow(workflow, handlerRef.current, onStep);
    },
    [],
  );

  return useSecureWrite(run);
}

export type UsePlaceLimitOrderError =
  | PrepareLimitOrderPostingError
  | PostOrderError
  | CancelledSigningError
  | UnauthenticatedError;

export type UsePlaceLimitOrderResult = [
  placeLimitOrder: (
    request: PrepareLimitOrderRequest,
  ) => Promise<OrderResponse>,
  state: WorkflowWriteResult<
    OrderResponse,
    UsePlaceLimitOrderError,
    PlaceOrderStep
  >,
];

/**
 * Places a limit order for the session account through the workflow handler.
 *
 * @remarks
 * Signing flows through the handler; `step` reports `'signOrder'` while the
 * wallet is being asked. There is no automatic allowance recovery: a rejection
 * for insufficient balance or allowance surfaces as `InsufficientAllowanceError`,
 * and the integrator decides how to recover, such as running
 * `useSetupTradingApprovals`. Failures surface on `error` and also reject the
 * returned promise; errors thrown by the workflow handler itself are
 * rethrown as-is. A response with `success: false` is a data-level rejection,
 * not an error.
 *
 * @example
 * ```tsx
 * const handler = useWorkflowHandler(walletClient);
 * const [placeOrder, { status }] = usePlaceLimitOrder(handler);
 *
 * await placeOrder({ price: 0.52, side: OrderSide.BUY, size: 10, tokenId });
 * ```
 */
export function usePlaceLimitOrder(
  handler: WorkflowHandler<SignOrderRequest>,
): UsePlaceLimitOrderResult {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const run = useCallback(
    async (
      client: BaseSecureClient,
      onStep: (kind: PlaceOrderStep) => void,
      request: PrepareLimitOrderRequest,
    ) => {
      const workflow = await prepareLimitOrderPosting(client, request);

      return driveWorkflow(workflow, handlerRef.current, onStep);
    },
    [],
  );

  return useSecureWrite(run);
}

export type UseCancelOrderError = CancelOrderError | UnauthenticatedError;

export type UseCancelOrderResult = [
  cancelOrder: (request: CancelOrderRequest) => Promise<CancelOrdersResponse>,
  state: WriteResult<CancelOrdersResponse, UseCancelOrderError>,
];

/**
 * Cancels one of the session account's open orders.
 *
 * @remarks
 * Cancellation is not wallet-interactive, so no workflow handler is needed.
 * Failures surface on `error` and also reject the returned promise.
 *
 * @example
 * ```tsx
 * const [cancel, { status }] = useCancelOrder();
 *
 * await cancel({ orderId: order.id });
 * ```
 */
export function useCancelOrder(): UseCancelOrderResult {
  const run = useCallback(
    (
      client: BaseSecureClient,
      _onStep: (kind: never) => void,
      request: CancelOrderRequest,
    ) => cancelOrder(client, request),
    [],
  );

  const [execute, state] = useSecureWrite<
    [CancelOrderRequest],
    CancelOrdersResponse,
    UseCancelOrderError
  >(run);

  return [
    execute,
    {
      status: state.status,
      data: state.data,
      error: state.error,
      reset: state.reset,
    },
  ];
}
