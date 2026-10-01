import { WalletType } from '@polymarket/bindings/gamma';
import type { EvmAddress, EvmSignature } from '@polymarket/types';
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
  ConvertInputSchema,
  HorizontalOperationInputSchema,
} from '../neg-risk-input';
import { expectTransactionHandle, type TransactionHandle } from '../types';
import {
  completeWith,
  type SendConvertTransactionRequest,
  type SendHorizontalMergeTransactionRequest,
  type SendHorizontalSplitTransactionRequest,
  signerTransactionRequest,
} from '../workflow';
import {
  GaslessTransactionMetadataSchema,
  type GaslessWorkflowRequest,
  prepareGaslessTransaction,
} from './gasless';

/** A neg-risk operation yields an EOA transaction or the wallet's gasless signing steps. */
export type NegRiskWorkflow = AsyncGenerator<
  | GaslessWorkflowRequest
  | SendConvertTransactionRequest
  | SendHorizontalSplitTransactionRequest
  | SendHorizontalMergeTransactionRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

/** Signing steps for a neg-risk conversion. */
export type ConvertWorkflow = AsyncGenerator<
  GaslessWorkflowRequest | SendConvertTransactionRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

export type PrepareConvertRequest = {
  /** Protocol V2 neg-risk event ID: bytes29 or zero-padded bytes32, not an API event ID. */
  eventId: string;
  /** Positive explicit amount in six-decimal base units (1_000_000n = one unit). */
  amount: bigint;
  /** Optional transaction metadata for gasless wallets. */
  metadata?: string;
  /** Index of the NO condition, from zero through event arity (the synthetic Other). */
  conditionIndex: number;
};

const PrepareConvertRequestSchema = ConvertInputSchema.safeExtend({
  metadata: GaslessTransactionMetadataSchema.optional(),
});

export type PrepareConvertError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareConvertError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Prepares a workflow: Converts NO into YES for all other conditions.
 * Includes Other unless converting NO(Other).
 * Requires PositionManager operator approval for the Router. No approvals are submitted automatically.
 * Preparing does not sign or submit; advance the returned workflow to execute it.
 * @throws {@link PrepareConvertError} Thrown on failure, including while advancing the workflow.
 */
export async function prepareConvert(
  client: BaseSecureClient,
  request: PrepareConvertRequest,
): Promise<ConvertWorkflow> {
  const params = parseUserInput(request, PrepareConvertRequestSchema);
  const call = routerConvertCall(
    client.environment.contracts.protocolV2Router,
    params.eventId,
    params.conditionIndex,
    params.amount,
  );
  return async function* (): ConvertWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield {
          kind: 'sendConvertTransaction',
          request: signerTransactionRequest(client.environment.chainId, call),
        },
      );
    }
    return yield* await prepareGaslessTransaction(client, {
      calls: [call],
      metadata:
        params.metadata ??
        `Convert ${params.amount} for event ${params.eventId}`,
    });
  }.call(null);
}

export type ConvertError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ConvertError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Converts NO into YES for all other conditions.
 * Includes Other unless converting NO(Other).
 * Requires PositionManager operator approval for the Router. No approvals are submitted automatically.
 * Signs and submits using the authenticated wallet; call the returned handle's wait() to confirm.
 * @throws {@link ConvertError} Thrown on failure.
 */
export function convert(
  client: BaseSecureClient,
  request: PrepareConvertRequest,
): Promise<TransactionHandle> {
  return prepareConvert(client, request).then(completeWith(client.signer));
}

/** Signing steps for a horizontal split. */
export type HorizontalSplitWorkflow = AsyncGenerator<
  GaslessWorkflowRequest | SendHorizontalSplitTransactionRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

export type PrepareHorizontalSplitRequest = {
  /** Protocol V2 neg-risk event ID: bytes29 or zero-padded bytes32, not an API event ID. */
  eventId: string;
  /** Positive explicit amount in six-decimal base units (1_000_000n = one unit). */
  amount: bigint;
  /** Optional transaction metadata for gasless wallets. */
  metadata?: string;
};

const PrepareHorizontalSplitRequestSchema =
  HorizontalOperationInputSchema.safeExtend({
    metadata: GaslessTransactionMetadataSchema.optional(),
  });

export type PrepareHorizontalSplitError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareHorizontalSplitError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Prepares a workflow: Splits pUSD into YES for every condition, including Other.
 * Requires pUSD spending approval for the Router. No approvals are submitted automatically.
 * Preparing does not sign or submit; advance the returned workflow to execute it.
 * @throws {@link PrepareHorizontalSplitError} Thrown on failure, including while advancing the workflow.
 */
export async function prepareHorizontalSplit(
  client: BaseSecureClient,
  request: PrepareHorizontalSplitRequest,
): Promise<HorizontalSplitWorkflow> {
  const params = parseUserInput(request, PrepareHorizontalSplitRequestSchema);
  const call = routerHorizontalSplitCall(
    client.environment.contracts.protocolV2Router,
    params.eventId,
    params.amount,
  );
  return async function* (): HorizontalSplitWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield {
          kind: 'sendHorizontalSplitTransaction',
          request: signerTransactionRequest(client.environment.chainId, call),
        },
      );
    }
    return yield* await prepareGaslessTransaction(client, {
      calls: [call],
      metadata:
        params.metadata ??
        `HorizontalSplit ${params.amount} for event ${params.eventId}`,
    });
  }.call(null);
}

export type HorizontalSplitError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const HorizontalSplitError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Splits pUSD into YES for every condition, including Other.
 * Requires pUSD spending approval for the Router. No approvals are submitted automatically.
 * Signs and submits using the authenticated wallet; call the returned handle's wait() to confirm.
 * @throws {@link HorizontalSplitError} Thrown on failure.
 */
export function horizontalSplit(
  client: BaseSecureClient,
  request: PrepareHorizontalSplitRequest,
): Promise<TransactionHandle> {
  return prepareHorizontalSplit(client, request).then(
    completeWith(client.signer),
  );
}

/** Signing steps for a horizontal merge. */
export type HorizontalMergeWorkflow = AsyncGenerator<
  GaslessWorkflowRequest | SendHorizontalMergeTransactionRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

export type PrepareHorizontalMergeRequest = {
  /** Protocol V2 neg-risk event ID: bytes29 or zero-padded bytes32, not an API event ID. */
  eventId: string;
  /** Positive explicit amount in six-decimal base units (1_000_000n = one unit). */
  amount: bigint;
  /** Optional transaction metadata for gasless wallets. */
  metadata?: string;
};

const PrepareHorizontalMergeRequestSchema =
  HorizontalOperationInputSchema.safeExtend({
    metadata: GaslessTransactionMetadataSchema.optional(),
  });

export type PrepareHorizontalMergeError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareHorizontalMergeError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Prepares a workflow: Merges equal YES amounts from every condition, including Other, into pUSD.
 * Requires PositionManager operator approval for the Router. No approvals are submitted automatically.
 * Preparing does not sign or submit; advance the returned workflow to execute it.
 * @throws {@link PrepareHorizontalMergeError} Thrown on failure, including while advancing the workflow.
 */
export async function prepareHorizontalMerge(
  client: BaseSecureClient,
  request: PrepareHorizontalMergeRequest,
): Promise<HorizontalMergeWorkflow> {
  const params = parseUserInput(request, PrepareHorizontalMergeRequestSchema);
  const call = routerHorizontalMergeCall(
    client.environment.contracts.protocolV2Router,
    params.eventId,
    params.amount,
  );
  return async function* (): HorizontalMergeWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield {
          kind: 'sendHorizontalMergeTransaction',
          request: signerTransactionRequest(client.environment.chainId, call),
        },
      );
    }
    return yield* await prepareGaslessTransaction(client, {
      calls: [call],
      metadata:
        params.metadata ??
        `HorizontalMerge ${params.amount} for event ${params.eventId}`,
    });
  }.call(null);
}

export type HorizontalMergeError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const HorizontalMergeError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Merges equal YES amounts from every condition, including Other, into pUSD.
 * Requires PositionManager operator approval for the Router. No approvals are submitted automatically.
 * Signs and submits using the authenticated wallet; call the returned handle's wait() to confirm.
 * @throws {@link HorizontalMergeError} Thrown on failure.
 */
export function horizontalMerge(
  client: BaseSecureClient,
  request: PrepareHorizontalMergeRequest,
): Promise<TransactionHandle> {
  return prepareHorizontalMerge(client, request).then(
    completeWith(client.signer),
  );
}
