import { WalletType } from '@polymarket/bindings/gamma';
import {
  type DirectionalEventId,
  DirectionalEventIdSchema,
  DirectionalPositionIdSchema,
  decodeDirectionalEventId,
  decodeDirectionalInstrument,
  deriveThresholdPositionId,
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
  type SendMergeDirectionalTransactionRequest,
  type SendSplitDirectionalTransactionRequest,
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
    if (params.line >= decodeDirectionalEventId(params.eventId).bucketCount) {
      ctx.addIssue({
        code: 'custom',
        path: ['line'],
        message: 'Expected a line below the real-bucket count',
      });
    }
  });
const DirectionalPairSchema = z
  .object({
    positionIdA: DirectionalPositionIdSchema.transform(
      decodeDirectionalInstrument,
    ),
    positionIdB: DirectionalPositionIdSchema.transform(
      decodeDirectionalInstrument,
    ),
    amount: z
      .union([
        z
          .bigint()
          .positive()
          .max((1n << 256n) - 1n),
        z.literal('max'),
      ])
      .default('max'),
  })
  .superRefine((params, ctx) => {
    const a = params.positionIdA;
    const b = params.positionIdB;
    if (
      a.kind !== 'line' ||
      b.kind !== 'line' ||
      a.eventId !== b.eventId ||
      a.side === b.side
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['positionIdB'],
        message:
          'Expected ABOVE and BELOW threshold positions in the same directional event',
      });
      return;
    }
    const above = a.side === 'above' ? a : b;
    const below = a.side === 'below' ? a : b;
    if (above.index >= below.index) {
      ctx.addIssue({
        code: 'custom',
        path: ['positionIdB'],
        message: 'Expected ABOVE on a lower threshold than BELOW',
      });
    }
  })
  .transform(({ positionIdA: a, positionIdB: b, amount }) => {
    const above = a.side === 'above' ? a : b;
    const below = a.side === 'below' ? a : b;
    return {
      eventId: above.eventId,
      lowLine: above.index,
      highLine: below.index,
      amount,
    };
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
  eventId: string | DirectionalEventId;
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
  eventId: string | DirectionalEventId;
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

export type SplitDirectionalWorkflowRequest =
  | GaslessWorkflowRequest
  | SendSplitDirectionalTransactionRequest;

export type SplitDirectionalWorkflow = AsyncGenerator<
  SplitDirectionalWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

export type PrepareSplitDirectionalError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareSplitDirectionalError = makeErrorGuard(
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
 * highLine). Omitted amount or 'max' uses the fresh minimum of pUSD and all
 * required bucket balances. The input IDs may be in either order and identify
 * ABOVE on a lower threshold and BELOW on a higher threshold in the same event. The
 * workflow submits one atomic transaction. Confirm through the returned
 * handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareSplitDirectional(client, positionIdA, positionIdB, 1_000_000n);
 * ```
 *
 * @param amount - Six-decimal bigint base units per pair; omitted or 'max' uses the available maximum.
 *
 * @throws {@link PrepareSplitDirectionalError}
 * Thrown on failure.
 */
export async function prepareSplitDirectional(
  client: BaseSecureClient,
  positionIdA: string,
  positionIdB: string,
  amount?: bigint | 'max',
): Promise<SplitDirectionalWorkflow> {
  const params = parseUserInput(
    { positionIdA, positionIdB, amount },
    DirectionalPairSchema,
  );
  const resolvedAmount = await resolveBasketAmount(
    client,
    bucketRangePositionIds(params.eventId, params.lowLine, params.highLine),
    params.amount,
    { collateral: true },
  );
  const call = routerSplitDirectionalCall(
    client.environment.contracts.protocolV2Router,
    params.eventId,
    params.lowLine,
    params.highLine,
    resolvedAmount,
  );

  return async function* (): SplitDirectionalWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield sendSplitDirectionalTransaction(
          signerTransactionRequest(client.environment.chainId, call),
        ),
      );
    }
    return yield* await prepareGaslessTransaction(client, {
      calls: [call],
      metadata: `Split ${resolvedAmount} collateral and middle-bucket positions between lines ${params.lowLine} and ${params.highLine} of event ${params.eventId}`,
    });
  }.call(null);
}

export type SplitDirectionalError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const SplitDirectionalError = makeErrorGuard(
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
 * highLine). Omitted amount or 'max' uses the fresh minimum of pUSD and all
 * required bucket balances. The input IDs may be in either order and identify
 * ABOVE on a lower threshold and BELOW on a higher threshold in the same event. Uses
 * existing trading approvals; call `setupTradingApprovals()` when needed.
 * Confirmation stays explicit through the returned handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const handle = await splitDirectional(client, positionIdA, positionIdB, 1_000_000n);
 * await handle.wait();
 * ```
 *
 * @param amount - Six-decimal bigint base units per pair; omitted or 'max' uses the available maximum.
 *
 * @throws {@link SplitDirectionalError}
 * Thrown on failure.
 */
export function splitDirectional(
  client: BaseSecureClient,
  positionIdA: string,
  positionIdB: string,
  amount?: bigint | 'max',
): Promise<TransactionHandle> {
  return prepareSplitDirectional(client, positionIdA, positionIdB, amount).then(
    completeWith(client.signer),
  );
}

export type MergeDirectionalWorkflowRequest =
  | GaslessWorkflowRequest
  | SendMergeDirectionalTransactionRequest;

export type MergeDirectionalWorkflow = AsyncGenerator<
  MergeDirectionalWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

export type PrepareMergeDirectionalError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareMergeDirectionalError = makeErrorGuard(
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
 * highLine). The input IDs may be in either order and must identify ABOVE on a
 * lower threshold and BELOW on a higher threshold in the same event. Omitted
 * amount or 'max' uses the fresh minimum of the two threshold balances. The
 * workflow submits one atomic transaction. Confirm through the returned
 * handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareMergeDirectional(client, positionIdA, positionIdB, 1_000_000n);
 * ```
 *
 * @param amount - Six-decimal bigint base units per pair; omitted or 'max' uses the available maximum.
 *
 * @throws {@link PrepareMergeDirectionalError}
 * Thrown on failure.
 */
export async function prepareMergeDirectional(
  client: BaseSecureClient,
  positionIdA: string,
  positionIdB: string,
  amount?: bigint | 'max',
): Promise<MergeDirectionalWorkflow> {
  const params = parseUserInput(
    { positionIdA, positionIdB, amount },
    DirectionalPairSchema,
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
  const resolvedAmount = await resolveBasketAmount(
    client,
    [abovePositionId, belowPositionId],
    params.amount,
  );
  const call = routerMergeDirectionalCall(
    client.environment.contracts.protocolV2Router,
    params.eventId,
    params.lowLine,
    params.highLine,
    resolvedAmount,
  );

  return async function* (): MergeDirectionalWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield sendMergeDirectionalTransaction(
          signerTransactionRequest(client.environment.chainId, call),
        ),
      );
    }
    return yield* await prepareGaslessTransaction(client, {
      calls: [call],
      metadata: `Merge ${resolvedAmount} threshold positions between lines ${params.lowLine} and ${params.highLine} of event ${params.eventId}`,
    });
  }.call(null);
}

export type MergeDirectionalError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const MergeDirectionalError = makeErrorGuard(
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
 * highLine). The input IDs may be in either order and must identify ABOVE on a
 * lower threshold and BELOW on a higher threshold in the same event. Omitted
 * amount or 'max' uses the fresh minimum of the two threshold balances. Uses
 * existing trading approvals; call `setupTradingApprovals()` when needed.
 * Confirmation stays explicit through the returned handle's `wait()`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const handle = await mergeDirectional(client, positionIdA, positionIdB, 1_000_000n);
 * await handle.wait();
 * ```
 *
 * @param amount - Six-decimal bigint base units per pair; omitted or 'max' uses the available maximum.
 *
 * @throws {@link MergeDirectionalError}
 * Thrown on failure.
 */
export function mergeDirectional(
  client: BaseSecureClient,
  positionIdA: string,
  positionIdB: string,
  amount?: bigint | 'max',
): Promise<TransactionHandle> {
  return prepareMergeDirectional(client, positionIdA, positionIdB, amount).then(
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

function sendSplitDirectionalTransaction(
  request: SignerTransactionRequest,
): SendSplitDirectionalTransactionRequest {
  return {
    kind: 'sendSplitDirectionalTransaction',
    request,
  };
}

function sendMergeDirectionalTransaction(
  request: SignerTransactionRequest,
): SendMergeDirectionalTransactionRequest {
  return {
    kind: 'sendMergeDirectionalTransaction',
    request,
  };
}
