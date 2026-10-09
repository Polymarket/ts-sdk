import { WalletType } from '@polymarket/bindings/gamma';
import {
  DirectionalEventIdSchema,
  decodeProtocolEventId,
  deriveThresholdPositionId,
  type ProtocolEventId,
  ThresholdSide,
  ThresholdSideSchema,
} from '@polymarket/bindings/protocol';
import type { EvmAddress, EvmSignature } from '@polymarket/types';
import { z } from 'zod';
import {
  routerComposeThresholdCall,
  routerDecomposeThresholdCall,
  routerMergeDirectionalCall,
  routerSplitDirectionalCall,
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
  type SendComposeThresholdTransactionRequest,
  type SendDecomposeThresholdTransactionRequest,
  type SendMergeDirectionalPositionsTransactionRequest,
  type SendSplitDirectionalPositionsTransactionRequest,
  signerTransactionRequest,
} from '../workflow';
import {
  GaslessTransactionMetadataSchema,
  type GaslessWorkflowRequest,
  prepareGaslessTransaction,
} from './gasless';
import {
  bucketRangePositionIds,
  resolveBasketAmount,
  thresholdBasketPositionIds,
} from './position-baskets';

const ThresholdLineSchema = z.number().int().min(1);
const ThresholdRequestSchema = z
  .object({
    eventId: DirectionalEventIdSchema,
    line: ThresholdLineSchema,
    side: ThresholdSideSchema,
    amount: z.union([z.bigint().positive(), z.literal('max')]),
    metadata: GaslessTransactionMetadataSchema.optional(),
  })
  .superRefine((params, ctx) => {
    if (params.line >= decodeProtocolEventId(params.eventId).arity) {
      ctx.addIssue({
        code: 'custom',
        path: ['line'],
        message: 'Expected a line below the real-bucket count',
      });
    }
  });
const DirectionalLinesRequestSchema = z
  .object({
    eventId: DirectionalEventIdSchema,
    lowLine: ThresholdLineSchema,
    highLine: ThresholdLineSchema,
    metadata: GaslessTransactionMetadataSchema.optional(),
  })
  .superRefine((params, ctx) => {
    if (params.highLine >= decodeProtocolEventId(params.eventId).arity) {
      ctx.addIssue({
        code: 'custom',
        path: ['highLine'],
        message: 'Expected a line below the real-bucket count',
      });
    }
    if (params.lowLine >= params.highLine) {
      ctx.addIssue({
        code: 'custom',
        path: ['lowLine'],
        message: 'Expected lowLine to be strictly less than highLine',
      });
    }
  });

export type ComposeThresholdWorkflowRequest =
  | GaslessWorkflowRequest
  | SendComposeThresholdTransactionRequest;

export type ComposeThresholdWorkflow = AsyncGenerator<
  ComposeThresholdWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

/**
 * Parameters for preparing a threshold composition.
 */
export type PrepareComposeThresholdRequest = {
  /** Protocol event ID of a directional event. Not the numeric ID of an `Event`. */
  eventId: string | ProtocolEventId;
  /** Ordinal threshold line in [1, real-bucket count - 1]. */
  line: number;
  /** ABOVE or BELOW side to compose. */
  side: ThresholdSide;
  /** Amount per required bucket YES position, or their fresh minimum balance. */
  amount: bigint | 'max';
  /** Optional transaction metadata. */
  metadata?: string;
};

const PrepareComposeThresholdRequestSchema =
  ThresholdRequestSchema satisfies z.ZodType<PrepareComposeThresholdRequest>;

export type PrepareComposeThresholdError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareComposeThresholdError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Prepares a workflow to compose bucket YES positions into one threshold side.
 *
 * ABOVE consumes real buckets at or past the line. BELOW consumes real buckets
 * before the line and Void. 'max' uses the fresh minimum across the exact
 * basket. The workflow submits one atomic transaction. Confirm through the
 * returned handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareComposeThreshold(client, {
 *   eventId: '0x0400112233445566778899aabbccddeeff000400000000000000000000',
 *   line: 2,
 *   side: ThresholdSide.Below,
 *   amount: 'max',
 * });
 * ```
 *
 * @throws {@link PrepareComposeThresholdError}
 * Thrown on failure.
 */
export async function prepareComposeThreshold(
  client: BaseSecureClient,
  request: PrepareComposeThresholdRequest,
): Promise<ComposeThresholdWorkflow> {
  const params = parseUserInput(request, PrepareComposeThresholdRequestSchema);
  const amount = await resolveBasketAmount(
    client,
    thresholdBasketPositionIds(params.eventId, params.line, params.side),
    params.amount,
  );
  const call = routerComposeThresholdCall(
    client.environment.contracts.protocolV2Router,
    params.eventId,
    params.line,
    params.side,
    amount,
  );

  return async function* (): ComposeThresholdWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield sendComposeThresholdTransaction(
          signerTransactionRequest(client.environment.chainId, call),
        ),
      );
    }
    return yield* await prepareGaslessTransaction(client, {
      calls: [call],
      metadata:
        params.metadata ??
        `Compose ${amount} ${params.side} threshold positions at line ${params.line} of event ${params.eventId}`,
    });
  }.call(null);
}

export type ComposeThresholdError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ComposeThresholdError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Composes bucket YES positions into one threshold side.
 *
 * ABOVE consumes real buckets at or past the line. BELOW consumes real buckets
 * before the line and Void. 'max' uses the fresh minimum across the exact
 * basket. Uses existing trading approvals; call `setupTradingApprovals()` when
 * needed. Confirmation stays explicit through the returned handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const handle = await composeThreshold(client, {
 *   eventId: '0x0400112233445566778899aabbccddeeff000400000000000000000000',
 *   line: 2,
 *   side: ThresholdSide.Below,
 *   amount: 'max',
 * });
 * await handle.wait();
 * ```
 *
 * @throws {@link ComposeThresholdError}
 * Thrown on failure.
 */
export function composeThreshold(
  client: BaseSecureClient,
  request: PrepareComposeThresholdRequest,
): Promise<TransactionHandle> {
  return prepareComposeThreshold(client, request).then(
    completeWith(client.signer),
  );
}

export type DecomposeThresholdWorkflowRequest =
  | GaslessWorkflowRequest
  | SendDecomposeThresholdTransactionRequest;

export type DecomposeThresholdWorkflow = AsyncGenerator<
  DecomposeThresholdWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

/**
 * Parameters for preparing a threshold decomposition.
 */
export type PrepareDecomposeThresholdRequest = {
  /** Protocol event ID of a directional event. Not the numeric ID of an `Event`. */
  eventId: string | ProtocolEventId;
  /** Ordinal threshold line in [1, real-bucket count - 1]. */
  line: number;
  /** ABOVE or BELOW side to decompose. */
  side: ThresholdSide;
  /** Threshold amount, or its fresh full balance. */
  amount: bigint | 'max';
  /** Optional transaction metadata. */
  metadata?: string;
};

const PrepareDecomposeThresholdRequestSchema =
  ThresholdRequestSchema satisfies z.ZodType<PrepareDecomposeThresholdRequest>;

export type PrepareDecomposeThresholdError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareDecomposeThresholdError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Prepares a workflow to decompose one threshold side into its bucket YES
 * basket.
 *
 * ABOVE returns real buckets at or past the line. BELOW returns real buckets
 * before the line and Void. 'max' uses the fresh selected-side balance. The
 * workflow submits one atomic transaction. Confirm through the returned
 * handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareDecomposeThreshold(client, {
 *   eventId: '0x0400112233445566778899aabbccddeeff000400000000000000000000',
 *   line: 2,
 *   side: ThresholdSide.Below,
 *   amount: 'max',
 * });
 * ```
 *
 * @throws {@link PrepareDecomposeThresholdError}
 * Thrown on failure.
 */
export async function prepareDecomposeThreshold(
  client: BaseSecureClient,
  request: PrepareDecomposeThresholdRequest,
): Promise<DecomposeThresholdWorkflow> {
  const params = parseUserInput(
    request,
    PrepareDecomposeThresholdRequestSchema,
  );
  const positionId = deriveThresholdPositionId(
    params.eventId,
    params.line,
    params.side,
  );
  const amount = await resolveBasketAmount(client, [positionId], params.amount);
  const call = routerDecomposeThresholdCall(
    client.environment.contracts.protocolV2Router,
    params.eventId,
    params.line,
    params.side,
    amount,
  );

  return async function* (): DecomposeThresholdWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield sendDecomposeThresholdTransaction(
          signerTransactionRequest(client.environment.chainId, call),
        ),
      );
    }
    return yield* await prepareGaslessTransaction(client, {
      calls: [call],
      metadata:
        params.metadata ??
        `Decompose ${amount} ${params.side} threshold positions at line ${params.line} of event ${params.eventId}`,
    });
  }.call(null);
}

export type DecomposeThresholdError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const DecomposeThresholdError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Decomposes one threshold side into its bucket YES basket.
 *
 * ABOVE returns real buckets at or past the line. BELOW returns real buckets
 * before the line and Void. 'max' uses the fresh selected-side balance. Uses
 * existing trading approvals; call `setupTradingApprovals()` when needed.
 * Confirmation stays explicit through the returned handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const handle = await decomposeThreshold(client, {
 *   eventId: '0x0400112233445566778899aabbccddeeff000400000000000000000000',
 *   line: 2,
 *   side: ThresholdSide.Below,
 *   amount: 'max',
 * });
 * await handle.wait();
 * ```
 *
 * @throws {@link DecomposeThresholdError}
 * Thrown on failure.
 */
export function decomposeThreshold(
  client: BaseSecureClient,
  request: PrepareDecomposeThresholdRequest,
): Promise<TransactionHandle> {
  return prepareDecomposeThreshold(client, request).then(
    completeWith(client.signer),
  );
}

export type SplitDirectionalPositionsWorkflowRequest =
  | GaslessWorkflowRequest
  | SendSplitDirectionalPositionsTransactionRequest;

export type SplitDirectionalPositionsWorkflow = AsyncGenerator<
  SplitDirectionalPositionsWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

/**
 * Parameters for preparing a directional position split.
 */
export type PrepareSplitDirectionalPositionsRequest = {
  /** Protocol event ID of a directional event. Not the numeric ID of an `Event`. */
  eventId: string | ProtocolEventId;
  /** Lower ordinal line; must be at least 1 and below highLine. */
  lowLine: number;
  /** Higher ordinal line; must be below the real-bucket count. */
  highLine: number;
  /** Collateral and amount per middle-bucket YES position to consume. */
  amount: bigint;
  /** Optional transaction metadata. */
  metadata?: string;
};

const PrepareSplitDirectionalPositionsRequestSchema =
  DirectionalLinesRequestSchema.safeExtend({
    amount: z.bigint().positive(),
  }) satisfies z.ZodType<PrepareSplitDirectionalPositionsRequest>;

export type PrepareSplitDirectionalPositionsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareSplitDirectionalPositionsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Prepares a workflow to split collateral and middle-bucket YES positions into
 * ABOVE(lowLine) and BELOW(highLine).
 *
 * Consumes the amount of collateral and each real bucket YES in [lowLine,
 * highLine). Lines are ordinal indices; they are not scalar values. The
 * workflow submits one atomic transaction. Confirm through the returned
 * handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareSplitDirectionalPositions(client, {
 *   eventId: '0x0400112233445566778899aabbccddeeff000400000000000000000000',
 *   lowLine: 1,
 *   highLine: 3,
 *   amount: 1_000_000n,
 * });
 * ```
 *
 * @throws {@link PrepareSplitDirectionalPositionsError}
 * Thrown on failure.
 */
export async function prepareSplitDirectionalPositions(
  client: BaseSecureClient,
  request: PrepareSplitDirectionalPositionsRequest,
): Promise<SplitDirectionalPositionsWorkflow> {
  const params = parseUserInput(
    request,
    PrepareSplitDirectionalPositionsRequestSchema,
  );
  const amount = await resolveBasketAmount(
    client,
    bucketRangePositionIds(params.eventId, params.lowLine, params.highLine),
    params.amount,
  );
  const call = routerSplitDirectionalCall(
    client.environment.contracts.protocolV2Router,
    params.eventId,
    params.lowLine,
    params.highLine,
    amount,
  );

  return async function* (): SplitDirectionalPositionsWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield sendSplitDirectionalPositionsTransaction(
          signerTransactionRequest(client.environment.chainId, call),
        ),
      );
    }
    return yield* await prepareGaslessTransaction(client, {
      calls: [call],
      metadata:
        params.metadata ??
        `Split ${amount} collateral and middle-bucket positions between lines ${params.lowLine} and ${params.highLine} of event ${params.eventId}`,
    });
  }.call(null);
}

export type SplitDirectionalPositionsError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const SplitDirectionalPositionsError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Splits collateral and middle-bucket YES positions into ABOVE(lowLine) and
 * BELOW(highLine).
 *
 * Consumes the amount of collateral and each real bucket YES in [lowLine,
 * highLine). Lines are ordinal indices; they are not scalar values. Uses
 * existing trading approvals; call `setupTradingApprovals()` when needed.
 * Confirmation stays explicit through the returned handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const handle = await splitDirectionalPositions(client, {
 *   eventId: '0x0400112233445566778899aabbccddeeff000400000000000000000000',
 *   lowLine: 1,
 *   highLine: 3,
 *   amount: 1_000_000n,
 * });
 * await handle.wait();
 * ```
 *
 * @throws {@link SplitDirectionalPositionsError}
 * Thrown on failure.
 */
export function splitDirectionalPositions(
  client: BaseSecureClient,
  request: PrepareSplitDirectionalPositionsRequest,
): Promise<TransactionHandle> {
  return prepareSplitDirectionalPositions(client, request).then(
    completeWith(client.signer),
  );
}

export type MergeDirectionalPositionsWorkflowRequest =
  | GaslessWorkflowRequest
  | SendMergeDirectionalPositionsTransactionRequest;

export type MergeDirectionalPositionsWorkflow = AsyncGenerator<
  MergeDirectionalPositionsWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

/**
 * Parameters for preparing a directional position merge.
 */
export type PrepareMergeDirectionalPositionsRequest = {
  /** Protocol event ID of a directional event. Not the numeric ID of an `Event`. */
  eventId: string | ProtocolEventId;
  /** Lower ordinal line; must be at least 1 and below highLine. */
  lowLine: number;
  /** Higher ordinal line; must be below the real-bucket count. */
  highLine: number;
  /** Amount per threshold position, or the fresh minimum of both balances. */
  amount: bigint | 'max';
  /** Optional transaction metadata. */
  metadata?: string;
};

const PrepareMergeDirectionalPositionsRequestSchema =
  DirectionalLinesRequestSchema.safeExtend({
    amount: z.union([z.bigint().positive(), z.literal('max')]),
  }) satisfies z.ZodType<PrepareMergeDirectionalPositionsRequest>;

export type PrepareMergeDirectionalPositionsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareMergeDirectionalPositionsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Prepares a workflow to merge ABOVE(lowLine) and BELOW(highLine) into
 * collateral and middle-bucket YES positions.
 *
 * Returns the amount of collateral and each real bucket YES in [lowLine,
 * highLine). 'max' uses the fresh minimum of the two threshold balances. The
 * workflow submits one atomic transaction. Confirm through the returned
 * handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareMergeDirectionalPositions(client, {
 *   eventId: '0x0400112233445566778899aabbccddeeff000400000000000000000000',
 *   lowLine: 1,
 *   highLine: 3,
 *   amount: 'max',
 * });
 * ```
 *
 * @throws {@link PrepareMergeDirectionalPositionsError}
 * Thrown on failure.
 */
export async function prepareMergeDirectionalPositions(
  client: BaseSecureClient,
  request: PrepareMergeDirectionalPositionsRequest,
): Promise<MergeDirectionalPositionsWorkflow> {
  const params = parseUserInput(
    request,
    PrepareMergeDirectionalPositionsRequestSchema,
  );
  const abovePositionId = deriveThresholdPositionId(
    params.eventId,
    params.lowLine,
    ThresholdSide.Above,
  );
  const belowPositionId = deriveThresholdPositionId(
    params.eventId,
    params.highLine,
    ThresholdSide.Below,
  );
  const amount = await resolveBasketAmount(
    client,
    [abovePositionId, belowPositionId],
    params.amount,
  );
  const call = routerMergeDirectionalCall(
    client.environment.contracts.protocolV2Router,
    params.eventId,
    params.lowLine,
    params.highLine,
    amount,
  );

  return async function* (): MergeDirectionalPositionsWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield sendMergeDirectionalPositionsTransaction(
          signerTransactionRequest(client.environment.chainId, call),
        ),
      );
    }
    return yield* await prepareGaslessTransaction(client, {
      calls: [call],
      metadata:
        params.metadata ??
        `Merge ${amount} threshold positions between lines ${params.lowLine} and ${params.highLine} of event ${params.eventId}`,
    });
  }.call(null);
}

export type MergeDirectionalPositionsError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const MergeDirectionalPositionsError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Merges ABOVE(lowLine) and BELOW(highLine) into collateral and middle-bucket
 * YES positions.
 *
 * Returns the amount of collateral and each real bucket YES in [lowLine,
 * highLine). 'max' uses the fresh minimum of the two threshold balances. Uses
 * existing trading approvals; call `setupTradingApprovals()` when needed.
 * Confirmation stays explicit through the returned handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const handle = await mergeDirectionalPositions(client, {
 *   eventId: '0x0400112233445566778899aabbccddeeff000400000000000000000000',
 *   lowLine: 1,
 *   highLine: 3,
 *   amount: 'max',
 * });
 * await handle.wait();
 * ```
 *
 * @throws {@link MergeDirectionalPositionsError}
 * Thrown on failure.
 */
export function mergeDirectionalPositions(
  client: BaseSecureClient,
  request: PrepareMergeDirectionalPositionsRequest,
): Promise<TransactionHandle> {
  return prepareMergeDirectionalPositions(client, request).then(
    completeWith(client.signer),
  );
}

function sendComposeThresholdTransaction(
  request: SignerTransactionRequest,
): SendComposeThresholdTransactionRequest {
  return {
    kind: 'sendComposeThresholdTransaction',
    request,
  };
}

function sendDecomposeThresholdTransaction(
  request: SignerTransactionRequest,
): SendDecomposeThresholdTransactionRequest {
  return {
    kind: 'sendDecomposeThresholdTransaction',
    request,
  };
}

function sendSplitDirectionalPositionsTransaction(
  request: SignerTransactionRequest,
): SendSplitDirectionalPositionsTransactionRequest {
  return {
    kind: 'sendSplitDirectionalPositionsTransaction',
    request,
  };
}

function sendMergeDirectionalPositionsTransaction(
  request: SignerTransactionRequest,
): SendMergeDirectionalPositionsTransactionRequest {
  return {
    kind: 'sendMergeDirectionalPositionsTransaction',
    request,
  };
}
