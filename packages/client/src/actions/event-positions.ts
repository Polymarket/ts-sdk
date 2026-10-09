import type { PositionId } from '@polymarket/bindings';
import { WalletType } from '@polymarket/bindings/gamma';
import {
  decodeProtocolPositionId,
  type ProtocolEventId,
  ProtocolEventIdSchema,
  ProtocolModule,
  ProtocolPositionIdSchema,
} from '@polymarket/bindings/protocol';
import type { EvmAddress, EvmSignature } from '@polymarket/types';
import { z } from 'zod';
import {
  routerConvertCall,
  routerHorizontalMergeCall,
  routerHorizontalSplitCall,
} from '../abis';
import type { BaseSecureClient } from '../clients';
import {
  CancelledSigningError,
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import {
  expectTransactionHandle,
  type SignerTransactionRequest,
  type TransactionHandle,
} from '../types';
import {
  completeWith,
  type SendConvertPositionTransactionRequest,
  type SendMergeEventPositionsTransactionRequest,
  type SendSplitEventPositionsTransactionRequest,
  signerTransactionRequest,
} from '../workflow';
import {
  GaslessTransactionMetadataSchema,
  type GaslessWorkflowRequest,
  prepareGaslessTransaction,
} from './gasless';
import { eventYesPositionIds, resolveBasketAmount } from './position-baskets';

export type SplitEventPositionsWorkflowRequest =
  | GaslessWorkflowRequest
  | SendSplitEventPositionsTransactionRequest;

export type SplitEventPositionsWorkflow = AsyncGenerator<
  SplitEventPositionsWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

/**
 * Parameters for preparing an event position split.
 */
export type PrepareSplitEventPositionsRequest = {
  /** Protocol event ID of a neg-risk or directional event. Not the numeric ID of an `Event`. */
  eventId: string | ProtocolEventId;
  /** Collateral amount in base units. */
  amount: bigint;
  /** Optional transaction metadata. */
  metadata?: string;
};

const PrepareSplitEventPositionsRequestSchema = z.object({
  eventId: ProtocolEventIdSchema,
  amount: z.bigint().positive(),
  metadata: GaslessTransactionMetadataSchema.optional(),
}) satisfies z.ZodType<PrepareSplitEventPositionsRequest>;

export type PrepareSplitEventPositionsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareSplitEventPositionsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Prepares a workflow to split collateral into the complete event YES set.
 *
 * Neg-risk includes Other; directional includes Void. Requires a protocol event
 * ID for either module. The workflow submits one atomic transaction. Confirm
 * through the returned handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareSplitEventPositions(client, {
 *   eventId: '0x0400112233445566778899aabbccddeeff000400000000000000000000',
 *   amount: 1_000_000n,
 * });
 * ```
 *
 * @throws {@link PrepareSplitEventPositionsError}
 * Thrown on failure.
 */
export async function prepareSplitEventPositions(
  client: BaseSecureClient,
  request: PrepareSplitEventPositionsRequest,
): Promise<SplitEventPositionsWorkflow> {
  const params = parseUserInput(
    request,
    PrepareSplitEventPositionsRequestSchema,
  );
  const amount = params.amount;
  const call = routerHorizontalSplitCall(
    client.environment.contracts.protocolV2Router,
    params.eventId,
    amount,
  );

  return async function* (): SplitEventPositionsWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield sendSplitEventPositionsTransaction(
          signerTransactionRequest(client.environment.chainId, call),
        ),
      );
    }
    return yield* await prepareGaslessTransaction(client, {
      calls: [call],
      metadata:
        params.metadata ??
        `Split ${amount} collateral into event ${params.eventId} positions`,
    });
  }.call(null);
}

export type SplitEventPositionsError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const SplitEventPositionsError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Splits collateral into the complete event YES set.
 *
 * Neg-risk includes Other; directional includes Void. Requires a protocol event
 * ID for either module. Uses existing trading approvals; call
 * `setupTradingApprovals()` when needed. Confirmation stays explicit through
 * the returned handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const handle = await splitEventPositions(client, {
 *   eventId: '0x0400112233445566778899aabbccddeeff000400000000000000000000',
 *   amount: 1_000_000n,
 * });
 * await handle.wait();
 * ```
 *
 * @throws {@link SplitEventPositionsError}
 * Thrown on failure.
 */
export function splitEventPositions(
  client: BaseSecureClient,
  request: PrepareSplitEventPositionsRequest,
): Promise<TransactionHandle> {
  return prepareSplitEventPositions(client, request).then(
    completeWith(client.signer),
  );
}

export type MergeEventPositionsWorkflowRequest =
  | GaslessWorkflowRequest
  | SendMergeEventPositionsTransactionRequest;

export type MergeEventPositionsWorkflow = AsyncGenerator<
  MergeEventPositionsWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

/**
 * Parameters for preparing an event position merge.
 */
export type PrepareMergeEventPositionsRequest = {
  /** Protocol event ID of a neg-risk or directional event. Not the numeric ID of an `Event`. */
  eventId: string | ProtocolEventId;
  /** Amount per required YES position, or their fresh minimum balance. */
  amount: bigint | 'max';
  /** Optional transaction metadata. */
  metadata?: string;
};

const PrepareMergeEventPositionsRequestSchema = z.object({
  eventId: ProtocolEventIdSchema,
  amount: z.union([z.bigint().positive(), z.literal('max')]),
  metadata: GaslessTransactionMetadataSchema.optional(),
}) satisfies z.ZodType<PrepareMergeEventPositionsRequest>;

export type PrepareMergeEventPositionsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareMergeEventPositionsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Prepares a workflow to merge the complete event YES set back into collateral.
 *
 * Consumes every real YES position and Other or Void. 'max' uses fresh balances
 * during preparation and rejects a zero maximum. The workflow submits one
 * atomic transaction. Confirm through the returned handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareMergeEventPositions(client, {
 *   eventId: '0x0400112233445566778899aabbccddeeff000400000000000000000000',
 *   amount: 'max',
 * });
 * ```
 *
 * @throws {@link PrepareMergeEventPositionsError}
 * Thrown on failure.
 */
export async function prepareMergeEventPositions(
  client: BaseSecureClient,
  request: PrepareMergeEventPositionsRequest,
): Promise<MergeEventPositionsWorkflow> {
  const params = parseUserInput(
    request,
    PrepareMergeEventPositionsRequestSchema,
  );
  const amount = await resolveBasketAmount(
    client,
    eventYesPositionIds(params.eventId),
    params.amount,
  );
  const call = routerHorizontalMergeCall(
    client.environment.contracts.protocolV2Router,
    params.eventId,
    amount,
  );

  return async function* (): MergeEventPositionsWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield sendMergeEventPositionsTransaction(
          signerTransactionRequest(client.environment.chainId, call),
        ),
      );
    }
    return yield* await prepareGaslessTransaction(client, {
      calls: [call],
      metadata:
        params.metadata ??
        `Merge ${amount} YES positions from event ${params.eventId}`,
    });
  }.call(null);
}

export type MergeEventPositionsError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const MergeEventPositionsError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Merges the complete event YES set back into collateral.
 *
 * Consumes every real YES position and Other or Void. 'max' uses fresh balances
 * during preparation and rejects a zero maximum. Uses existing trading
 * approvals; call `setupTradingApprovals()` when needed. Confirmation stays
 * explicit through the returned handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const handle = await mergeEventPositions(client, {
 *   eventId: '0x0400112233445566778899aabbccddeeff000400000000000000000000',
 *   amount: 'max',
 * });
 * await handle.wait();
 * ```
 *
 * @throws {@link MergeEventPositionsError}
 * Thrown on failure.
 */
export function mergeEventPositions(
  client: BaseSecureClient,
  request: PrepareMergeEventPositionsRequest,
): Promise<TransactionHandle> {
  return prepareMergeEventPositions(client, request).then(
    completeWith(client.signer),
  );
}

export type ConvertPositionWorkflowRequest =
  | GaslessWorkflowRequest
  | SendConvertPositionTransactionRequest;

export type ConvertPositionWorkflow = AsyncGenerator<
  ConvertPositionWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

/**
 * Parameters for preparing a position conversion.
 */
export type PrepareConvertPositionRequest = {
  /** Neg-risk condition or directional bucket NO position, including Other or Void. */
  positionId: string | PositionId;
  /** Amount of the NO position, or its fresh full balance. */
  amount: bigint | 'max';
  /** Optional transaction metadata. */
  metadata?: string;
};

const PrepareConvertPositionRequestSchema = z
  .object({
    positionId: ProtocolPositionIdSchema,
    amount: z.union([z.bigint().positive(), z.literal('max')]),
    metadata: GaslessTransactionMetadataSchema.optional(),
  })
  .superRefine((params, ctx) => {
    const position = decodeProtocolPositionId(params.positionId);
    if (
      (position.moduleId !== ProtocolModule.NegRisk &&
        position.moduleId !== ProtocolModule.Directional) ||
      position.outcomeIndex !== 1 ||
      position.conditionIndex > position.arity
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['positionId'],
        message:
          'Expected a neg-risk condition or directional bucket NO position, including the synthetic fallback',
      });
    }
  }) satisfies z.ZodType<PrepareConvertPositionRequest>;

export type PrepareConvertPositionError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareConvertPositionError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Prepares a workflow to convert a NO position into YES positions for every
 * other condition in its event.
 *
 * Supports real conditions and synthetic Other/Void. Threshold positions cannot
 * be converted. 'max' uses the fresh NO balance during preparation. The
 * workflow submits one atomic transaction. Confirm through the returned
 * handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const { noPositionId } = deriveDirectionalBucketPositions({
 *   eventId: '0x0400112233445566778899aabbccddeeff000400000000000000000000',
 *   bucketIndex: 1,
 * });
 * const workflow = await prepareConvertPosition(client, {
 *   positionId: noPositionId,
 *   amount: 'max',
 * });
 * ```
 *
 * @throws {@link PrepareConvertPositionError}
 * Thrown on failure.
 */
export async function prepareConvertPosition(
  client: BaseSecureClient,
  request: PrepareConvertPositionRequest,
): Promise<ConvertPositionWorkflow> {
  const params = parseUserInput(request, PrepareConvertPositionRequestSchema);
  const position = decodeProtocolPositionId(params.positionId);
  const amount = await resolveBasketAmount(
    client,
    [params.positionId],
    params.amount,
  );
  const call = routerConvertCall(
    client.environment.contracts.protocolV2Router,
    position.eventId,
    position.conditionIndex,
    amount,
  );

  return async function* (): ConvertPositionWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield sendConvertPositionTransaction(
          signerTransactionRequest(client.environment.chainId, call),
        ),
      );
    }
    return yield* await prepareGaslessTransaction(client, {
      calls: [call],
      metadata:
        params.metadata ??
        `Convert ${amount} of NO position ${params.positionId}`,
    });
  }.call(null);
}

export type ConvertPositionError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ConvertPositionError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Converts a NO position into YES positions for every other condition in its
 * event.
 *
 * Supports real conditions and synthetic Other/Void. Threshold positions cannot
 * be converted. 'max' uses the fresh NO balance during preparation. Uses
 * existing trading approvals; call `setupTradingApprovals()` when needed.
 * Confirmation stays explicit through the returned handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const { noPositionId } = deriveDirectionalBucketPositions({
 *   eventId: '0x0400112233445566778899aabbccddeeff000400000000000000000000',
 *   bucketIndex: 1,
 * });
 * const handle = await convertPosition(client, {
 *   positionId: noPositionId,
 *   amount: 'max',
 * });
 * await handle.wait();
 * ```
 *
 * @throws {@link ConvertPositionError}
 * Thrown on failure.
 */
export function convertPosition(
  client: BaseSecureClient,
  request: PrepareConvertPositionRequest,
): Promise<TransactionHandle> {
  return prepareConvertPosition(client, request).then(
    completeWith(client.signer),
  );
}

function sendSplitEventPositionsTransaction(
  request: SignerTransactionRequest,
): SendSplitEventPositionsTransactionRequest {
  return {
    kind: 'sendSplitEventPositionsTransaction',
    request,
  };
}

function sendMergeEventPositionsTransaction(
  request: SignerTransactionRequest,
): SendMergeEventPositionsTransactionRequest {
  return {
    kind: 'sendMergeEventPositionsTransaction',
    request,
  };
}

function sendConvertPositionTransaction(
  request: SignerTransactionRequest,
): SendConvertPositionTransactionRequest {
  return {
    kind: 'sendConvertPositionTransaction',
    request,
  };
}
