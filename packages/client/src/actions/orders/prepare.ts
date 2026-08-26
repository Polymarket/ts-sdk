import { expectEvmSignature } from '@polymarket/types';
import type { BaseSecureClient } from '../../clients';
import {
  InsufficientLiquidityError,
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../../errors';
import { parseUserInput } from '../../input';
import { wrapDepositWalletSignature } from '../../wallet';
import { PrepareLimitOrderParamsSchema, prepareLimitOrderDraft } from './limit';
import {
  PrepareMarketOrderParamsSchema,
  prepareMarketOrderDraft,
} from './market';
import { createSignedOrder, createUnsignedOrder } from './orders';
import { postOrder } from './post';
import {
  createOrderSignature,
  createOrderTypedDataPayload,
} from './typed-data';
import {
  type OrderPostingWorkflow,
  type OrderWorkflow,
  type PrepareLimitOrderRequest,
  type PrepareMarketOrderRequest,
  signOrder,
} from './types';

export type PrepareMarketOrderError =
  | InsufficientLiquidityError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareMarketOrderError = makeErrorGuard(
  InsufficientLiquidityError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Starts the market-order workflow.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link PrepareMarketOrderError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const workflow = await prepareMarketOrder(client, {
 *   assetId:
 *     '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 *   amount: 10,
 *   maxPrice: '0.55',
 *   side: OrderSide.BUY,
 * });
 * ```
 */
export async function prepareMarketOrder(
  client: BaseSecureClient,
  request: PrepareMarketOrderRequest,
): Promise<OrderWorkflow> {
  const params = parseUserInput(request, PrepareMarketOrderParamsSchema);

  return async function* (): OrderWorkflow {
    const draft = await prepareMarketOrderDraft(client, params);

    const unsignedOrder = createUnsignedOrder(draft, client.account);

    const signature = expectEvmSignature(
      yield signOrder(createOrderTypedDataPayload(unsignedOrder)),
    );

    return createSignedOrder(
      unsignedOrder,
      wrapDepositWalletSignature(
        client.account,
        createOrderSignature(unsignedOrder, signature),
      ),
    );
  }.call(null);
}

export type PrepareLimitOrderError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareLimitOrderError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Starts the limit-order workflow.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link PrepareLimitOrderError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const workflow = await prepareLimitOrder(client, {
 *   assetId:
 *     '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 *   postOnly: true,
 *   price: 0.52,
 *   side: OrderSide.BUY,
 *   size: 10,
 * });
 * ```
 */
export async function prepareLimitOrder(
  client: BaseSecureClient,
  request: PrepareLimitOrderRequest,
): Promise<OrderWorkflow> {
  const params = parseUserInput(request, PrepareLimitOrderParamsSchema);

  return async function* (): OrderWorkflow {
    const draft = await prepareLimitOrderDraft(client, params);

    const unsignedOrder = createUnsignedOrder(draft, client.account);

    const signature = expectEvmSignature(
      yield signOrder(createOrderTypedDataPayload(unsignedOrder)),
    );

    const order = createSignedOrder(
      unsignedOrder,
      wrapDepositWalletSignature(
        client.account,
        createOrderSignature(unsignedOrder, signature),
      ),
    );

    return params.postOnly === true ? { ...order, postOnly: true } : order;
  }.call(null);
}

export type PrepareMarketOrderPostingError = PrepareMarketOrderError;
export const PrepareMarketOrderPostingError = PrepareMarketOrderError;

/**
 * Starts and posts a market-order workflow.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link PrepareMarketOrderPostingError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const workflow = await prepareMarketOrderPosting(client, {
 *   assetId:
 *     '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 *   minPrice: '0.54',
 *   shares: 10,
 *   side: OrderSide.SELL,
 * });
 * ```
 */
export async function prepareMarketOrderPosting(
  client: BaseSecureClient,
  request: PrepareMarketOrderRequest,
): Promise<OrderPostingWorkflow> {
  return createOrderPostingWorkflow(
    client,
    prepareMarketOrder(client, request),
  );
}

export type PrepareLimitOrderPostingError = PrepareLimitOrderError;
export const PrepareLimitOrderPostingError = PrepareLimitOrderError;

/**
 * Starts and posts a limit-order workflow.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link PrepareLimitOrderPostingError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const workflow = await prepareLimitOrderPosting(client, {
 *   assetId:
 *     '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 *   postOnly: true,
 *   price: 0.52,
 *   side: OrderSide.BUY,
 *   size: 10,
 * });
 * ```
 */
export async function prepareLimitOrderPosting(
  client: BaseSecureClient,
  request: PrepareLimitOrderRequest,
): Promise<OrderPostingWorkflow> {
  return createOrderPostingWorkflow(client, prepareLimitOrder(client, request));
}

async function createOrderPostingWorkflow(
  client: BaseSecureClient,
  workflowPromise: Promise<OrderWorkflow>,
): Promise<OrderPostingWorkflow> {
  const workflow = await workflowPromise;

  return async function* (): OrderPostingWorkflow {
    const order = yield* workflow;

    return postOrder(client)(order);
  }.call(null);
}
