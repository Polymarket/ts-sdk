import { EvmAddressSchema, TransactionIdSchema } from '@polymarket/bindings';
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
  type RelayerExecuteResponse,
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
  expectEvmSignature,
  expectHexString,
  expectNonEmptyArray,
  type HexString,
  invariant,
  isHexString,
  type NonEmptyArray,
  unwrap,
  ZERO_ADDRESS,
} from '@polymarket/types';
import { Bytes, Hash, TypedData as OxTypedData } from 'ox';
import { z } from 'zod';
import { encodeProxyCall, encodeSafeMultisendCall } from '../abis';
import type { BaseClient, BaseSecureClient } from '../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import { validateWith } from '../response';
import type {
  TransactionCall,
  TransactionHandle,
  TransactionOutcome,
  TypedDataField,
  TypedDataPayload,
} from '../types';
import { deriveCurrentDepositWalletAddress } from '../wallet';
import {
  type RequestAddressRequest,
  requestAddress,
  type SignGaslessMessageRequest,
  type SignGaslessTypedDataRequest,
} from '../workflow';
import { toSearchParams } from './params';

const EIP712_DOMAIN: readonly TypedDataField[] = [
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

const SAFE_TRANSACTION: readonly TypedDataField[] = [
  { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'data', type: 'bytes' },
  { name: 'operation', type: 'uint8' },
  { name: 'safeTxGas', type: 'uint256' },
  { name: 'baseGas', type: 'uint256' },
  { name: 'gasPrice', type: 'uint256' },
  { name: 'gasToken', type: 'address' },
  { name: 'refundReceiver', type: 'address' },
  { name: 'nonce', type: 'uint256' },
];

const DEPOSIT_WALLET_DOMAIN_NAME = 'DepositWallet';
const DEPOSIT_WALLET_DOMAIN_VERSION = '1';
const DEPOSIT_WALLET_DEFAULT_DEADLINE_SECONDS = 600;

const DEPOSIT_WALLET_CALL: readonly TypedDataField[] = [
  { name: 'target', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'data', type: 'bytes' },
];

const DEPOSIT_WALLET_BATCH: readonly TypedDataField[] = [
  { name: 'wallet', type: 'address' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
  { name: 'calls', type: 'Call[]' },
];

const FetchExecuteParamsRequestSchema = z.object({
  address: z.string(),
  type: z.enum(RelayerTransactionType),
});

export type FetchExecuteParamsRequest = z.input<
  typeof FetchExecuteParamsRequestSchema
>;

export type FetchExecuteParamsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchExecuteParamsError = makeErrorGuard(
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
): Promise<RelayerExecuteParams> {
  const params = parseUserInput(request, FetchExecuteParamsRequestSchema);

  return unwrap(
    client.relayer
      .get('/v1/account/transactions/params', {
        params: toSearchParams(params, { address: 'address', type: 'type' }),
      })
      .andThen(validateWith(RelayerExecuteParamsSchema)),
  );
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
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const IsWalletDeployedError = makeErrorGuard(
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
): Promise<boolean> {
  const params = await resolveWalletDeploymentTarget(client, request);

  if (params.type === WalletType.EOA) {
    return false;
  }

  return unwrap(
    client.relayer
      .get('/deployed', {
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
      })
      .andThen(validateWith(RelayerDeployedResponseSchema))
      .map(({ deployed }) => deployed),
  );
}

async function resolveWalletDeploymentTarget(
  client: BaseClient,
  request: IsWalletDeployedRequest | undefined,
): Promise<z.output<typeof IsWalletDeployedRequestSchema>> {
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
): Promise<GaslessTransaction> {
  const params = parseUserInput(request, FetchGaslessTransactionRequestSchema);

  return unwrap(
    client.relayer
      .get(`/v1/account/transactions/${params.transactionId}`)
      .andThen(validateWith(GaslessTransactionSchema)),
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

type PrepareGaslessTransactionParams = z.output<
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

    for (
      let attempt = 0;
      attempt <= GASLESS_SUBMIT_RETRY_ATTEMPTS;
      attempt += 1
    ) {
      try {
        switch (client.account.walletType) {
          case WalletType.POLY_PROXY:
            return yield* prepareProxyWalletGaslessTransaction(client, params);
          case WalletType.DEPOSIT_WALLET:
            return yield* prepareDepositWalletGaslessTransaction(
              client,
              params,
            );
          case WalletType.GNOSIS_SAFE:
            return yield* prepareSafeWalletGaslessTransaction(client, params);
        }

        invariant(false, 'Unsupported wallet type for gasless transaction');
      } catch (error) {
        if (
          !isRetryableGaslessSubmitError(error) ||
          attempt === GASLESS_SUBMIT_RETRY_ATTEMPTS
        ) {
          throw error;
        }

        await delay(client.environment.relayerPollFrequencyMs);
      }
    }

    invariant(false, 'Expected gasless transaction retry loop to return');
  }.call(null);
}

async function* prepareProxyWalletGaslessTransaction(
  client: BaseSecureClient,
  params: PrepareGaslessTransactionParams,
): GaslessWorkflow {
  const payload = yield* buildProxyWalletExecuteRequest(
    client,
    params.calls,
    params.metadata,
  );

  return executeGasless(client, payload);
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

  const to = client.environment.walletDerivation.proxyFactory;
  const data = encodeProxyCall(calls);
  const relayerFee = '0';
  // Signed RelayHub parameter; the relayer applies its own execution gas price.
  const gasPrice = '0';
  const gasLimit = (
    await client.rpc.ethEstimateGas({
      data,
      from: client.account.signer,
      to,
    })
  ).toString();
  const relayHub = client.environment.contracts.relayHub;
  const relay = executeParams.address;

  const hash = buildProxyTransactionHash(
    client.account.signer,
    to,
    data,
    relayerFee,
    gasPrice,
    gasLimit,
    executeParams.nonce,
    relayHub,
    relay,
  );

  const signature = expectEvmSignature(yield signGaslessMessage(hash));

  return {
    data,
    from: client.account.signer,
    ...(metadata !== undefined && { metadata }),
    nonce: executeParams.nonce,
    proxyWallet: client.account.wallet,
    signature,
    signatureParams: {
      gasLimit,
      gasPrice,
      relay,
      relayHub,
      relayerFee,
    },
    to,
    type: RelayerTransactionType.PROXY,
  };
}

/**
 * Extracts the on-chain nonce reported by a submission rejection for a
 * Deposit Wallet batch signed with a mismatched nonce, when present.
 *
 * @internal
 */
export function extractOnChainNonceFromSubmitError(
  error: unknown,
): string | undefined {
  if (!(error instanceof RequestRejectedError) || error.status !== 400) {
    return undefined;
  }

  const match =
    /batch nonce\s+\d+\s+does not match on-chain nonce\s+(\d+)/i.exec(
      error.message,
    );

  return match?.[1];
}

async function* prepareDepositWalletGaslessTransaction(
  client: BaseSecureClient,
  params: PrepareGaslessTransactionParams,
): GaslessWorkflow {
  const payload = yield* buildDepositWalletExecuteRequest(
    client,
    params.calls,
    params.metadata,
  );

  try {
    return await executeGasless(client, payload);
  } catch (error) {
    const nonce = extractOnChainNonceFromSubmitError(error);
    if (nonce === undefined) {
      throw error;
    }

    const request = yield* resignDepositWalletExecuteRequest(
      client,
      payload,
      params.calls,
      nonce,
    );

    return executeGasless(client, request);
  }
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
  const depositWalletCalls = calls.map(toDepositWalletCall);
  const deadline = `${Math.floor(Date.now() / 1000) + DEPOSIT_WALLET_DEFAULT_DEADLINE_SECONDS}`;

  const signature = expectEvmSignature(
    yield signGaslessTypedData(
      createDepositWalletBatchTypedDataPayload({
        calls: depositWalletCalls,
        chainId: client.environment.chainId,
        deadline,
        nonce: executeParams.nonce,
        wallet: client.account.wallet,
      }),
    ),
  );

  return {
    depositWalletParams: {
      calls: depositWalletCalls,
      deadline,
      depositWallet: client.account.wallet,
    },
    from: client.account.signer,
    ...(metadata !== undefined && { metadata }),
    nonce: executeParams.nonce,
    signature,
    to: client.environment.walletDerivation.depositWalletFactory,
    type: RelayerTransactionType.WALLET,
  };
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
  const signature = expectEvmSignature(
    yield signGaslessTypedData(
      createDepositWalletBatchTypedDataPayload({
        calls: calls.map(toDepositWalletCall),
        chainId: client.environment.chainId,
        deadline: request.depositWalletParams.deadline,
        nonce,
        wallet: client.account.wallet,
      }),
    ),
  );

  return { ...request, nonce, signature };
}

async function* prepareSafeWalletGaslessTransaction(
  client: BaseSecureClient,
  params: PrepareGaslessTransactionParams,
): GaslessWorkflow {
  const payload = yield* buildSafeWalletExecuteRequest(
    client,
    params.calls,
    params.metadata,
  );

  return executeGasless(client, payload);
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
  const transaction = aggregateSafeTransactionCalls(
    calls,
    client.environment.contracts.safeMultisend,
  );

  const safePayload = createSafeTypedDataPayload({
    chainId: client.environment.chainId,
    data: transaction.data,
    nonce: executeParams.nonce,
    operation: transaction.operation,
    safeAddress: client.account.wallet,
    to: transaction.to,
    value: transaction.value,
  });

  const signature = expectEvmSignature(
    yield signGaslessMessage(
      expectHexString(
        OxTypedData.getSignPayload(
          safePayload as Parameters<typeof OxTypedData.getSignPayload>[0],
        ),
      ),
    ),
  );

  return {
    data: transaction.data,
    from: client.account.signer,
    ...(metadata !== undefined && { metadata }),
    nonce: executeParams.nonce,
    proxyWallet: client.account.wallet,
    signature: packSafeSignature(signature),
    signatureParams: createSafeSignatureParams(transaction.operation),
    to: transaction.to,
    type: RelayerTransactionType.SAFE,
    value: transaction.value > 0n ? `${transaction.value}` : undefined,
  };
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

  const response = await unwrap(
    client.relayer
      .post('/submit', {
        json: payload,
      })
      .andThen(validateWith(RelayerExecuteResponseSchema)),
  );

  return new GaslessTransactionHandle(client, response);
}

/**
 * Detects transient relayer submission failures (rate limits, wallet-busy
 * races, stale batch nonces) that are safe to retry with a fresh signature.
 *
 * @internal
 */
export function isRetryableGaslessSubmitError(error: unknown): boolean {
  if (error instanceof RateLimitError) {
    return true;
  }

  if (!(error instanceof RequestRejectedError) || error.status !== 400) {
    return false;
  }

  if (
    (/wallet busy/i.test(error.message) &&
      /active action/i.test(error.message)) ||
    /wallet has in-flight action/i.test(error.message)
  ) {
    return true;
  }

  const match =
    /batch nonce\s+(\d+)\s+does not match on-chain nonce\s+(\d+)/i.exec(
      error.message,
    );
  if (match === null) {
    return false;
  }

  const submittedNonce = match[1];
  const onChainNonce = match[2];
  if (submittedNonce === undefined || onChainNonce === undefined) {
    return false;
  }

  return BigInt(submittedNonce) < BigInt(onChainNonce);
}

type DepositWalletCall = {
  data: HexString;
  target: EvmAddress;
  value: string;
};

type CreateDepositWalletBatchTypedDataPayloadRequest = {
  calls: readonly DepositWalletCall[];
  chainId: number;
  deadline: string;
  nonce: string;
  wallet: EvmAddress;
};

function toDepositWalletCall(call: TransactionCall): DepositWalletCall {
  return {
    data: call.data,
    target: call.to,
    value: `${call.value ?? 0n}`,
  };
}

function createDepositWalletBatchTypedDataPayload(
  request: CreateDepositWalletBatchTypedDataPayloadRequest,
): TypedDataPayload {
  return {
    domain: {
      chainId: request.chainId,
      name: DEPOSIT_WALLET_DOMAIN_NAME,
      verifyingContract: request.wallet,
      version: DEPOSIT_WALLET_DOMAIN_VERSION,
    },
    message: {
      calls: request.calls.map((call) => ({
        data: call.data,
        target: call.target,
        value: BigInt(call.value),
      })),
      deadline: BigInt(request.deadline),
      nonce: BigInt(request.nonce),
      wallet: request.wallet,
    },
    primaryType: 'Batch',
    types: {
      Batch: DEPOSIT_WALLET_BATCH,
      Call: DEPOSIT_WALLET_CALL,
    },
  };
}

type SafeTransaction = {
  data: HexString;
  operation: 0 | 1;
  to: EvmAddress;
  value: bigint;
};

type CreateSafeTypedDataPayloadRequest = {
  chainId: number;
  data: HexString;
  nonce: string;
  operation: 0 | 1;
  safeAddress: EvmAddress;
  to: EvmAddress;
  value: bigint;
};

function aggregateSafeTransactionCalls(
  calls: NonEmptyArray<TransactionCall>,
  safeMultisend: EvmAddress,
): SafeTransaction {
  if (calls.length === 1) {
    const [call] = calls;

    return {
      data: call.data,
      operation: 0,
      to: call.to,
      value: call.value ?? 0n,
    };
  }

  return {
    data: encodeSafeMultisendCall(calls),
    operation: 1,
    to: safeMultisend,
    value: 0n,
  };
}

function createSafeSignatureParams(operation: 0 | 1) {
  return {
    baseGas: '0',
    gasPrice: '0',
    gasToken: ZERO_ADDRESS,
    operation: `${operation}`,
    refundReceiver: ZERO_ADDRESS,
    safeTxnGas: '0',
  };
}

function createSafeTypedDataPayload(
  request: CreateSafeTypedDataPayloadRequest,
): TypedDataPayload {
  return {
    domain: {
      chainId: request.chainId,
      verifyingContract: request.safeAddress,
    },
    message: {
      baseGas: 0n,
      data: request.data,
      gasPrice: 0n,
      gasToken: ZERO_ADDRESS,
      nonce: BigInt(request.nonce),
      operation: request.operation,
      refundReceiver: ZERO_ADDRESS,
      safeTxGas: 0n,
      to: request.to,
      value: request.value,
    },
    primaryType: 'SafeTx',
    types: {
      EIP712Domain: EIP712_DOMAIN,
      SafeTx: SAFE_TRANSACTION,
    },
  };
}

function signGaslessMessage(payload: HexString): SignGaslessMessageRequest {
  return {
    kind: 'signGaslessMessage',
    payload,
  };
}

function signGaslessTypedData(
  payload: TypedDataPayload,
): SignGaslessTypedDataRequest {
  return {
    kind: 'signGaslessTypedData',
    payload,
  };
}

function buildProxyTransactionHash(
  from: EvmAddress,
  to: EvmAddress,
  data: HexString,
  relayerFee: string,
  gasPrice: string,
  gasLimit: string,
  nonce: string,
  relayHub: EvmAddress,
  relay: EvmAddress,
): HexString {
  return expectHexString(
    Hash.keccak256(
      Bytes.concat(
        Bytes.fromString('rlx:'),
        Bytes.fromHex(from),
        Bytes.fromHex(to),
        Bytes.fromHex(data),
        Bytes.fromNumber(BigInt(relayerFee), { size: 32 }),
        Bytes.fromNumber(BigInt(gasPrice), { size: 32 }),
        Bytes.fromNumber(BigInt(gasLimit), { size: 32 }),
        Bytes.fromNumber(BigInt(nonce), { size: 32 }),
        Bytes.fromHex(relayHub),
        Bytes.fromHex(relay),
      ),
      { as: 'Hex' },
    ),
  );
}

function packSafeSignature(signature: EvmSignature): HexString {
  const prefixlessSignature = signature.slice(2);
  const v = Number.parseInt(prefixlessSignature.slice(128, 130), 16);

  const packedV =
    v === 0 || v === 1 ? v + 31 : v === 27 || v === 28 ? v + 4 : v;

  return expectHexString(
    `0x${prefixlessSignature.slice(0, 128)}${packedV.toString(16).padStart(2, '0')}`,
  );
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

  constructor(client: BaseClient, response: RelayerExecuteResponse) {
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
