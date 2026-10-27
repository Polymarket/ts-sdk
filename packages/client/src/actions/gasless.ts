import {
  EvmAddressSchema,
  type TransactionId,
  TransactionIdSchema,
} from '@polymarket/bindings';
import { WalletType } from '@polymarket/bindings/gamma';
import {
  type GaslessTransaction,
  GaslessTransactionSchema,
  RelayerDeployedResponseSchema,
  type RelayerDepositWalletExecuteRequest,
  type RelayerExecuteParams,
  RelayerExecuteParamsSchema,
  type RelayerExecuteRequest,
  RelayerExecuteRequestSchema,
  RelayerExecuteResponseSchema,
  type RelayerLegacyExecuteRequest,
  RelayerTransactionState,
  RelayerTransactionType,
} from '@polymarket/bindings/relayer';
import {
  delay,
  type EvmAddress,
  type EvmSignature,
  expectEvmAddress,
  expectNonEmptyArray,
  type HexString,
  invariant,
  isHexString,
  type NonEmptyArray,
  type TxHash,
} from '@polymarket/types';
import { z } from 'zod';
import { encodeProxyCall } from '../abis';
import type { BaseClient, BaseSecureClient } from '../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import { parseRequestOptions, type RequestOptions } from '../request-options';
import type {
  TransactionCall,
  TransactionHandle,
  TransactionOutcome,
} from '../types';
import { deriveCurrentDepositWalletAddress } from '../wallet';
import {
  type RequestAddressRequest,
  requestAddress,
  type SignGaslessMessageRequest,
  type SignGaslessTypedDataRequest,
} from '../workflow';
import {
  resignDepositWalletEnvelope,
  signDepositWalletEnvelope,
  signProxyWalletEnvelope,
  signSafeWalletEnvelope,
} from './gasless/envelopes';
import { submitGaslessWorkflow } from './gasless/submission';
import { toSearchParams } from './params';

/** @internal */
export {
  extractOnChainNonceFromSubmitError,
  isRetryableGaslessSubmitError,
} from './gasless/submit-errors';

const DEPOSIT_WALLET_DEFAULT_DEADLINE_SECONDS = 600;

const FetchExecuteParamsRequestSchema = z.object({
  address: z.string(),
  type: z.enum(RelayerTransactionType),
});

export type FetchExecuteParamsRequest = z.input<
  typeof FetchExecuteParamsRequestSchema
>;

export type FetchExecuteParamsError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchExecuteParamsError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches the parameters needed to prepare a low-level transaction submission.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchExecuteParamsError}
 * Thrown on failure.
 */
export async function fetchExecuteParams(
  client: BaseClient,
  request: FetchExecuteParamsRequest,
  options: RequestOptions = {},
): Promise<RelayerExecuteParams> {
  const requestOptions = parseRequestOptions(options);
  const params = parseUserInput(request, FetchExecuteParamsRequestSchema);

  return client.relayer.get('/v1/account/transactions/params', {
    ...requestOptions,
    params: toSearchParams(params, { address: 'address', type: 'type' }),
    schema: RelayerExecuteParamsSchema,
  });
}

const FetchGaslessTransactionRequestSchema = z.object({
  transactionId: TransactionIdSchema,
});

export type FetchGaslessTransactionRequest = z.input<
  typeof FetchGaslessTransactionRequestSchema
>;

const IsWalletDeployedRequestSchema = z.object({
  wallet: EvmAddressSchema,
  type: z.enum(WalletType),
});

export type IsWalletDeployedRequest = z.input<
  typeof IsWalletDeployedRequestSchema
>;

export type IsWalletDeployedError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const IsWalletDeployedError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Checks whether a wallet is deployed for relayer-backed transactions.
 *
 * It only checks deployment status; it does not check trading approvals or complete
 * order-readiness.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link IsWalletDeployedError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const deployed = await isWalletDeployed(client, {
 *   wallet: '0x1234...',
 * });
 * ```
 */
export async function isWalletDeployed(
  client: BaseClient,
  request?: IsWalletDeployedRequest,
  options: RequestOptions = {},
): Promise<boolean> {
  const requestOptions = parseRequestOptions(options);
  const params = await resolveWalletDeploymentTarget(
    client,
    request,
    requestOptions,
  );

  if (params.type === WalletType.EOA) {
    return false;
  }

  return client.relayer
    .get('/deployed', {
      ...requestOptions,
      params: toSearchParams(
        {
          address: params.wallet,
          type:
            params.type === WalletType.DEPOSIT_WALLET
              ? RelayerTransactionType.WALLET
              : undefined,
        },
        { address: 'address', type: 'type' },
      ),
      schema: RelayerDeployedResponseSchema,
    })
    .then(({ deployed }) => deployed);
}

async function resolveWalletDeploymentTarget(
  client: BaseClient,
  request: IsWalletDeployedRequest | undefined,
  options: RequestOptions = {},
): Promise<z.output<typeof IsWalletDeployedRequestSchema>> {
  const requestOptions = parseRequestOptions(options);
  if (request !== undefined) {
    return parseUserInput(request, IsWalletDeployedRequestSchema);
  }

  if (!client.isSecureClient()) {
    throw new UserInputError(
      'Gasless readiness inference requires a secure client. Pass a wallet and type when using a public client.',
    );
  }

  if (client.account.walletType !== WalletType.EOA) {
    return {
      wallet: client.account.wallet,
      type: client.account.walletType,
    };
  }

  return {
    wallet: await deriveCurrentDepositWalletAddress(
      client.rpc,
      client.account.signer,
      client.environment.walletDerivation,
      requestOptions,
    ),
    type: WalletType.DEPOSIT_WALLET,
  };
}

export const GaslessTransactionMetadataSchema = z.string().max(500);

const GASLESS_SUBMIT_RETRY_ATTEMPTS = 10;

export type DeployDepositWalletError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const DeployDepositWalletError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Deploys a Deposit Wallet for the authenticated signer.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link DeployDepositWalletError}
 * Thrown on failure.
 */
export async function deployDepositWallet(
  client: BaseSecureClient,
): Promise<TransactionHandle> {
  invariant(
    client.supportsGasless,
    'Deposit Wallet deployment requires a Relayer API Key or Builder API Key in the client configuration.',
  );

  return executeGasless(client, {
    from: client.account.signer,
    metadata: 'Deploy Deposit Wallet',
    to: client.environment.walletDerivation.depositWalletFactory,
    type: RelayerTransactionType.WALLET_CREATE,
  });
}

export type FetchGaslessTransactionError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchGaslessTransactionError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches a submitted transaction.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchGaslessTransactionError}
 * Thrown on failure.
 */
export async function fetchTransaction(
  client: BaseClient,
  request: FetchGaslessTransactionRequest,
  options: RequestOptions = {},
): Promise<GaslessTransaction> {
  const requestOptions = parseRequestOptions(options);
  const params = parseUserInput(request, FetchGaslessTransactionRequestSchema);

  return client.relayer.get(
    `/v1/account/transactions/${params.transactionId}`,
    { ...requestOptions, schema: GaslessTransactionSchema },
  );
}

const TransactionCallSchema = z.object({
  data: z.custom<HexString>(isHexString),
  to: EvmAddressSchema,
  value: z.bigint().optional(),
});

const PrepareGaslessTransactionRequestSchema = z.object({
  calls: z
    .array(TransactionCallSchema)
    .min(1)
    .transform((val) => expectNonEmptyArray(val)),
  metadata: GaslessTransactionMetadataSchema,
});

export type PrepareGaslessTransactionRequest = z.input<
  typeof PrepareGaslessTransactionRequestSchema
>;

export type GaslessWorkflowRequest =
  | RequestAddressRequest
  | SignGaslessMessageRequest
  | SignGaslessTypedDataRequest;

export type GaslessWorkflow = AsyncGenerator<
  GaslessWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

export type PrepareGaslessTransactionError =
  | ExecuteGaslessError
  | FetchExecuteParamsError
  | UserInputError;
export const PrepareGaslessTransactionError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Starts preparing a low-level transaction workflow from one or more calls.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link PrepareGaslessTransactionError}
 * Thrown on failure.
 */
export async function prepareGaslessTransaction(
  client: BaseSecureClient,
  request: PrepareGaslessTransactionRequest,
): Promise<GaslessWorkflow> {
  const params = parseUserInput(
    request,
    PrepareGaslessTransactionRequestSchema,
  );

  invariant(
    client.supportsGasless,
    'Gasless transactions require a Relayer API Key or Builder API Key in the client configuration.',
  );
  invariant(
    client.account.walletType === WalletType.GNOSIS_SAFE ||
      client.account.walletType === WalletType.POLY_PROXY ||
      client.account.walletType === WalletType.DEPOSIT_WALLET,
    'Gasless transaction preparation supports Deposit Wallet, Safe-backed, and proxy-backed accounts',
  );

  return async function* (): GaslessWorkflow {
    const signer = expectEvmAddress(yield requestAddress());

    invariant(
      signer === client.account.signer,
      'Wallet client address does not match the authenticated signer',
    );

    return yield* submitGaslessWorkflow(
      {
        build: () => {
          switch (client.account.walletType) {
            case WalletType.POLY_PROXY:
              return buildProxyWalletExecuteRequest(
                client,
                params.calls,
                params.metadata,
              );
            case WalletType.DEPOSIT_WALLET:
              return buildDepositWalletExecuteRequest(
                client,
                params.calls,
                params.metadata,
              );
            case WalletType.GNOSIS_SAFE:
              return buildSafeWalletExecuteRequest(
                client,
                params.calls,
                params.metadata,
              );
            default:
              invariant(
                false,
                'Unsupported wallet type for gasless transaction',
              );
          }
        },
        submit: (envelope) => executeGasless(client, envelope),
        resign:
          client.account.walletType === WalletType.DEPOSIT_WALLET
            ? (envelope, nonce) => {
                invariant(
                  envelope.type === RelayerTransactionType.WALLET,
                  'Expected Deposit Wallet envelope',
                );
                return resignDepositWalletExecuteRequest(
                  client,
                  envelope,
                  params.calls,
                  nonce,
                );
              }
            : undefined,
      },
      GASLESS_SUBMIT_RETRY_ATTEMPTS,
      client.environment.relayerPollFrequencyMs,
    );
  }.call(null);
}

/**
 * Builds and signs a Proxy Wallet relay request without submitting it, so
 * callers can route the signed envelope to their own submission endpoint.
 *
 * @internal
 */
export async function* buildProxyWalletExecuteRequest(
  client: BaseSecureClient,
  calls: NonEmptyArray<TransactionCall>,
  metadata?: string,
): AsyncGenerator<
  GaslessWorkflowRequest,
  RelayerLegacyExecuteRequest,
  EvmAddress | EvmSignature | TransactionHandle
> {
  const executeParams = await fetchExecuteParams(client, {
    address: client.account.signer,
    type: RelayerTransactionType.PROXY,
  });
  const data = encodeProxyCall(calls);
  const gasLimit = await client.rpc.ethEstimateGas({
    data,
    from: client.account.signer,
    to: client.environment.walletDerivation.proxyFactory,
  });
  return yield* signProxyWalletEnvelope({
    account: client.account,
    data,
    metadata,
    executeParams,
    proxyFactory: client.environment.walletDerivation.proxyFactory,
    relayHub: client.environment.contracts.relayHub,
    gasLimit,
  });
}

/**
 * Builds and signs a Deposit Wallet batch execution request without
 * submitting it, so callers can route the signed envelope to their own
 * submission endpoint.
 *
 * @internal
 */
export async function* buildDepositWalletExecuteRequest(
  client: BaseSecureClient,
  calls: NonEmptyArray<TransactionCall>,
  metadata?: string,
): AsyncGenerator<
  GaslessWorkflowRequest,
  RelayerDepositWalletExecuteRequest,
  EvmAddress | EvmSignature | TransactionHandle
> {
  const executeParams = await fetchExecuteParams(client, {
    address: client.account.signer,
    type: RelayerTransactionType.WALLET,
  });
  return yield* signDepositWalletEnvelope({
    account: client.account,
    chainId: client.environment.chainId,
    factory: client.environment.walletDerivation.depositWalletFactory,
    calls,
    metadata,
    nonce: executeParams.nonce,
    deadline: `${Math.floor(Date.now() / 1000) + DEPOSIT_WALLET_DEFAULT_DEADLINE_SECONDS}`,
  });
}

/**
 * Re-signs a previously built Deposit Wallet batch execution request with a
 * corrected nonce, leaving the batch otherwise unchanged.
 *
 * @internal
 */
export async function* resignDepositWalletExecuteRequest(
  client: BaseSecureClient,
  request: RelayerDepositWalletExecuteRequest,
  calls: NonEmptyArray<TransactionCall>,
  nonce: string,
): AsyncGenerator<
  GaslessWorkflowRequest,
  RelayerDepositWalletExecuteRequest,
  EvmAddress | EvmSignature | TransactionHandle
> {
  return yield* resignDepositWalletEnvelope(
    client.account,
    client.environment.chainId,
    request,
    calls,
    nonce,
  );
}

/**
 * Builds and signs a Safe transaction relay request without submitting it, so
 * callers can route the signed envelope to their own submission endpoint.
 *
 * @internal
 */
export async function* buildSafeWalletExecuteRequest(
  client: BaseSecureClient,
  calls: NonEmptyArray<TransactionCall>,
  metadata?: string,
): AsyncGenerator<
  GaslessWorkflowRequest,
  RelayerLegacyExecuteRequest,
  EvmAddress | EvmSignature | TransactionHandle
> {
  const executeParams = await fetchExecuteParams(client, {
    address: client.account.signer,
    type: RelayerTransactionType.SAFE,
  });
  return yield* signSafeWalletEnvelope({
    account: client.account,
    chainId: client.environment.chainId,
    calls,
    metadata,
    nonce: executeParams.nonce,
    safeMultisend: client.environment.contracts.safeMultisend,
  });
}

type ExecuteGaslessRequest = RelayerExecuteRequest;

type ExecuteGaslessError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

async function executeGasless(
  client: BaseClient,
  request: ExecuteGaslessRequest,
): Promise<GaslessTransactionHandle> {
  const payload = parseUserInput(request, RelayerExecuteRequestSchema);

  const response = await client.relayer.post('/submit', {
    json: payload,
    schema: RelayerExecuteResponseSchema,
  });

  return new GaslessTransactionHandle(client, response);
}

export type WaitForGaslessTransactionError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError
  | TimeoutError
  | TransactionFailedError;
export const WaitForGaslessTransactionError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
  TimeoutError,
  TransactionFailedError,
);

type SubmittedGaslessTransaction = {
  transactionHash: TxHash | null;
  transactionId: TransactionId;
};

/**
 * Transaction handle for relayer-backed submissions; polls the submitted
 * transaction until it settles.
 *
 * @internal
 */
export class GaslessTransactionHandle implements TransactionHandle {
  readonly #client: BaseClient;

  readonly transactionHash;
  readonly transactionId;

  constructor(client: BaseClient, response: SubmittedGaslessTransaction) {
    this.#client = client;
    this.transactionHash = response.transactionHash;
    this.transactionId = response.transactionId;
  }

  async wait(): Promise<TransactionOutcome> {
    let pollCount = 0;

    while (pollCount < this.#client.environment.relayerMaxPolls) {
      const transaction = await fetchTransaction(this.#client, {
        transactionId: this.transactionId,
      });

      if (transaction.state === RelayerTransactionState.STATE_CONFIRMED) {
        const transactionHash =
          transaction.transactionHash ?? this.transactionHash;

        if (transactionHash === null) {
          throw new UnexpectedResponseError(
            'Expected submitted transaction to have a transaction hash once settled',
          );
        }

        return {
          transactionHash,
          transactionId: transaction.transactionId,
        };
      }

      if (
        transaction.state === RelayerTransactionState.STATE_FAILED ||
        transaction.state === RelayerTransactionState.STATE_INVALID
      ) {
        throw new TransactionFailedError(
          transaction.errorMsg ??
            `Transaction ${transaction.transactionId} reached terminal state ${transaction.state}`,
        );
      }

      pollCount += 1;
      await delay(this.#client.environment.relayerPollFrequencyMs);
    }

    throw new TimeoutError(
      `Timed out waiting for transaction ${this.transactionId} to settle`,
    );
  }
}
