import {
  type RelayerDepositWalletExecuteRequest,
  type RelayerExecuteParams,
  type RelayerLegacyExecuteRequest,
  RelayerTransactionType,
} from '@polymarket/bindings/relayer';
import {
  type EvmAddress,
  type EvmSignature,
  expectEvmSignature,
  expectHexString,
  type HexString,
  type NonEmptyArray,
  ZERO_ADDRESS,
} from '@polymarket/types';
import { Bytes, Hash, TypedData as OxTypedData } from 'ox';
import { encodeSafeMultisendCall } from '../../abis';
import type {
  TransactionCall,
  TransactionHandle,
  TypedDataField,
  TypedDataPayload,
} from '../../types';
import { type AccountIdentity, wrapDepositWalletSignature } from '../../wallet';
import type {
  SignGaslessMessageRequest,
  SignGaslessTypedDataRequest,
} from '../../workflow';
import type { GaslessWorkflowRequest } from '../gasless';

type EnvelopeWorkflow<T> = AsyncGenerator<
  GaslessWorkflowRequest,
  T,
  EvmAddress | EvmSignature | TransactionHandle
>;
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

type EnvelopeCalls = {
  account: AccountIdentity;
  calls: NonEmptyArray<TransactionCall>;
  metadata?: string;
};

export async function* signProxyWalletEnvelope({
  account,
  data,
  metadata,
  executeParams,
  proxyFactory,
  relayHub,
  gasLimit: estimatedGas,
}: Omit<EnvelopeCalls, 'calls'> & {
  data: HexString;
  executeParams: RelayerExecuteParams;
  proxyFactory: EvmAddress;
  relayHub: EvmAddress;
  gasLimit: bigint;
}): EnvelopeWorkflow<RelayerLegacyExecuteRequest> {
  const to = proxyFactory;
  const relayerFee = '0';
  // Signed RelayHub parameter; the relayer applies its own execution gas price.
  const gasPrice = '0';
  const gasLimit = `${estimatedGas}`;
  const relay = executeParams.address;

  const hash = buildProxyTransactionHash(
    account.signer,
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
    from: account.signer,
    ...(metadata !== undefined && { metadata }),
    nonce: executeParams.nonce,
    proxyWallet: account.wallet,
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

export async function* signDepositWalletEnvelope({
  account,
  calls,
  metadata,
  chainId,
  factory,
  nonce,
  deadline,
}: EnvelopeCalls & {
  chainId: number;
  factory: EvmAddress;
  nonce: string;
  deadline: string;
}): EnvelopeWorkflow<RelayerDepositWalletExecuteRequest> {
  const depositWalletCalls = calls.map(toDepositWalletCall);

  const signature = wrapDepositWalletSignature(
    account,
    expectEvmSignature(
      yield signGaslessTypedData(
        createDepositWalletBatchTypedDataPayload({
          calls: depositWalletCalls,
          chainId,
          deadline,
          nonce,
          wallet: account.wallet,
        }),
      ),
    ),
  );

  return {
    depositWalletParams: {
      calls: depositWalletCalls,
      deadline,
      depositWallet: account.wallet,
    },
    from: account.signer,
    ...(metadata !== undefined && { metadata }),
    nonce,
    signature,
    to: factory,
    type: RelayerTransactionType.WALLET,
  };
}

export async function* resignDepositWalletEnvelope(
  account: AccountIdentity,
  chainId: number,
  request: RelayerDepositWalletExecuteRequest,
  calls: NonEmptyArray<TransactionCall>,
  nonce: string,
): EnvelopeWorkflow<RelayerDepositWalletExecuteRequest> {
  const signature = wrapDepositWalletSignature(
    account,
    expectEvmSignature(
      yield signGaslessTypedData(
        createDepositWalletBatchTypedDataPayload({
          calls: calls.map(toDepositWalletCall),
          chainId,
          deadline: request.depositWalletParams.deadline,
          nonce,
          wallet: account.wallet,
        }),
      ),
    ),
  );

  return { ...request, nonce, signature };
}

export async function* signSafeWalletEnvelope({
  account,
  calls,
  metadata,
  chainId,
  nonce,
  safeMultisend,
}: EnvelopeCalls & {
  chainId: number;
  nonce: string;
  safeMultisend: EvmAddress;
}): EnvelopeWorkflow<RelayerLegacyExecuteRequest> {
  const transaction = aggregateSafeTransactionCalls(calls, safeMultisend);

  const safePayload = createSafeTypedDataPayload({
    chainId,
    data: transaction.data,
    nonce,
    operation: transaction.operation,
    safeAddress: account.wallet,
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
    from: account.signer,
    ...(metadata !== undefined && { metadata }),
    nonce,
    proxyWallet: account.wallet,
    signature: packSafeSignature(signature),
    signatureParams: createSafeSignatureParams(transaction.operation),
    to: transaction.to,
    type: RelayerTransactionType.SAFE,
    value: transaction.value > 0n ? `${transaction.value}` : undefined,
  };
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
  const domain = {
    chainId: request.chainId,
    name: DEPOSIT_WALLET_DOMAIN_NAME,
    verifyingContract: request.wallet,
    version: DEPOSIT_WALLET_DOMAIN_VERSION,
  };

  return {
    domain,
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
      EIP712Domain: OxTypedData.extractEip712DomainTypes(domain),
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
