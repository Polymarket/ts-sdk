import type { TransactionId } from '@polymarket/bindings';
import {
  type EvmAddress,
  type EvmSignature,
  type HexString,
  invariant,
  type TxHash,
} from '@polymarket/types';
import type { WaitForGaslessTransactionError } from './actions';
import {
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from './errors';
import type { Fetch } from './request-options';

export type TypedDataField = {
  name: string;
  type: string;
};

export type TypedData = Record<string, readonly TypedDataField[]>;

export type TypedDataDomain = {
  chainId?: number;
  name?: string;
  salt?: HexString;
  verifyingContract?: EvmAddress;
  version?: string;
};

export type TypedDataPayload = {
  domain: TypedDataDomain;
  message: Record<string, unknown>;
  primaryType: string;
  types: TypedData;
};

export type TransactionCall = {
  data: HexString;
  to: EvmAddress;
  value?: bigint;
};

export type SignerTransactionRequest = {
  chainId: number;
  data?: HexString;
  to: EvmAddress;
  value?: bigint;
};

/** @internal */
export type ApiKeyAuthorizationRequest = {
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST';
  path: string;
  body?: string;
};

/** HTTP controls supplied to API key authorization for one request. @internal */
export type ApiKeyAuthorizationOptions = {
  fetch?: Fetch;
  signal?: AbortSignal;
};

export interface ApiKeyAuthorization {
  /** @internal */
  get isBuilderKey(): boolean;

  /** @internal */
  get supportGasless(): boolean;

  /** @internal */
  authorize(
    request: ApiKeyAuthorizationRequest,
    options?: ApiKeyAuthorizationOptions,
  ): Promise<HeadersInit>;
}

export type TransactionOutcome = {
  /**
   * The hash of the settled transaction.
   */
  transactionHash: TxHash;
  /**
   * The unique identifier of the settled transaction when submitted through the Polymarket API,
   * or null if the transaction was submitted directly to the blockchain.
   */
  transactionId: TransactionId | null;
};

export type WaitForTransactionError = WaitForGaslessTransactionError;
export const WaitForTransactionError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

export interface TransactionHandle {
  /**
   * The hash of the submitted transaction, or null if the transaction is pending submission.
   */
  readonly transactionHash: TxHash | null;
  /**
   * The unique identifier of the submitted transaction when submitted through the Polymarket API,
   * or null if the transaction was submitted directly to the blockchain.
   */
  readonly transactionId: TransactionId | null;
  /**
   * Waits for the submitted transaction to settle.
   *
   * @throws {@link WaitForTransactionError}
   * Thrown when polling times out, the transaction reaches a terminal failure state, or a later read returns an unexpected response.
   */
  wait(): Promise<TransactionOutcome>;
}

export type Signer = {
  getAddress(): Promise<EvmAddress>;
  signTypedData(payload: TypedDataPayload): Promise<EvmSignature>;
  signMessage(message: HexString): Promise<EvmSignature>;
  sendTransaction(
    request: SignerTransactionRequest,
  ): Promise<TransactionHandle>;
};

/** @internal */
export function expectTransactionHandle(
  value: unknown,
  message = 'Expected a TransactionHandle',
): TransactionHandle {
  invariant(
    typeof value === 'object' &&
      value !== null &&
      'transactionHash' in value &&
      'transactionId' in value &&
      'wait' in value &&
      typeof value.wait === 'function',
    message,
  );
  return value as TransactionHandle;
}
