import {
  expectEvmAddress,
  expectEvmSignature,
  expectTxHash,
  invariant,
  isPrivateKey,
  type PrivateKey,
  type TxHash,
} from '@polymarket/types';
import {
  type Account,
  type Chain,
  createWalletClient,
  type Hash,
  http,
  type SendTransactionParameters,
  type SendTransactionRequest,
  TransactionExecutionError,
  type Transport,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { waitForTransactionReceipt } from 'viem/actions';
import { polygon } from 'viem/chains';
import {
  CancelledSigningError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UserInputError,
} from './errors';
import type { Signer, TransactionHandle } from './types';

export type PrivateKeySignerOptions = {
  /** Chain used when sending direct EOA transactions. */
  chain?: Chain;
  /** Transport used when sending direct EOA transactions. */
  transport?: Transport;
};

function isWalletClientWithAccount(
  walletClient: WalletClient,
): walletClient is WalletClient<Transport, Chain, Account> {
  return walletClient.account !== undefined;
}

export function signerFrom(walletClient: WalletClient): Signer {
  invariant(
    isWalletClientWithAccount(walletClient),
    'Wallet client with account is required',
  );

  const account = walletClient.account;
  const address = expectEvmAddress(
    typeof walletClient.account === 'string'
      ? walletClient.account
      : walletClient.account.address,
  );

  return {
    getAddress() {
      return Promise.resolve(address);
    },
    async signTypedData(payload) {
      return expectEvmSignature(
        await signTypedData(walletClient, {
          account,
          ...payload,
        }),
      );
    },
    async signMessage(message) {
      return expectEvmSignature(
        await signMessage(walletClient, {
          account,
          message: { raw: message },
        }),
      );
    },
    async sendTransaction({ chainId, ...request }) {
      await assertChainId(walletClient, chainId);
      const hash = await sendTransaction(walletClient, {
        account,
        ...request,
      });
      return new DirectTransactionHandle(hash, walletClient);
    },
  };
}

/**
 * Creates a signer from a private key using viem local account signing.
 *
 * @example
 * ```ts
 * const secureClient = await createSecureClient({
 *   signer: privateKey(process.env.PRIVATE_KEY),
 *   wallet: '0x...',
 * });
 * ```
 */
export function privateKey(
  value: PrivateKey | string | undefined,
  options: PrivateKeySignerOptions = {},
): Signer {
  if (!isPrivateKey(value)) {
    throw new UserInputError('Expected a hex-encoded 32-byte private key.');
  }

  return signerFrom(
    createWalletClient({
      account: privateKeyToAccount(value),
      chain: options.chain ?? polygon,
      transport: options.transport ?? http(),
    }),
  );
}

async function sendTransaction<
  account extends Account,
  chain extends Chain,
  const request extends SendTransactionRequest<chain, chainOverride>,
  chainOverride extends Chain | undefined = undefined,
>(
  walletClient: WalletClient<Transport, chain, account>,
  request: SendTransactionParameters<chain, account, chainOverride, request>,
): Promise<TxHash> {
  try {
    const hash = await walletClient.sendTransaction(request);

    return expectTxHash(hash);
  } catch (error) {
    throwSigningWorkflowError(error);
  }
}

async function assertChainId(
  walletClient: WalletClient,
  expectedChainId: number,
): Promise<void> {
  try {
    const actualChainId =
      walletClient.chain?.id ?? (await walletClient.getChainId());

    if (actualChainId !== expectedChainId) {
      throw new SigningError(
        `Wallet client is connected to chain ${actualChainId}, expected ${expectedChainId}`,
      );
    }
  } catch (error) {
    throw error instanceof SigningError
      ? error
      : SigningError.fromError(
          error,
          'Could not resolve wallet client chain ID',
        );
  }
}

async function signTypedData<
  account extends Account,
  chain extends Chain,
  const request extends Parameters<
    WalletClient<Transport, chain, account>['signTypedData']
  >[0],
>(walletClient: WalletClient<Transport, chain, account>, request: request) {
  try {
    return await walletClient.signTypedData(request);
  } catch (error) {
    throwSigningWorkflowError(error);
  }
}

async function signMessage<
  account extends Account,
  chain extends Chain,
  const request extends Parameters<
    WalletClient<Transport, chain, account>['signMessage']
  >[0],
>(walletClient: WalletClient<Transport, chain, account>, request: request) {
  try {
    return await walletClient.signMessage(request);
  } catch (error) {
    throwSigningWorkflowError(error);
  }
}

function throwSigningWorkflowError(error: unknown): never {
  if (error instanceof UserRejectedRequestError) {
    throw CancelledSigningError.fromError(error);
  }

  if (error instanceof TransactionExecutionError) {
    const rejected = error.walk(
      (err) => err instanceof UserRejectedRequestError,
    );

    if (rejected) {
      throw CancelledSigningError.fromError(rejected);
    }
  }

  throw SigningError.fromError(error);
}

class DirectTransactionHandle implements TransactionHandle {
  readonly transactionId = null;

  #transactionHash: TxHash;
  readonly #walletClient: WalletClient;

  constructor(transactionHash: Hash, walletClient: WalletClient) {
    this.#transactionHash = expectTxHash(transactionHash);
    this.#walletClient = walletClient;
  }

  get transactionHash() {
    return this.#transactionHash;
  }

  async wait() {
    try {
      const receipt = await waitForTransactionReceipt(this.#walletClient, {
        hash: this.#transactionHash,
      });

      const transactionHash = expectTxHash(receipt.transactionHash);

      // viem's waitForTransactionReceipt supports transaction replacement
      // so it's important to use the transaction hash from the receipt
      this.#transactionHash = transactionHash;

      if (receipt.status === 'reverted') {
        throw new TransactionFailedError(
          `Transaction ${transactionHash} reverted`,
        );
      }

      return {
        transactionHash,
        transactionId: null,
      };
    } catch (error) {
      if (error instanceof TransactionFailedError) throw error;

      if (error instanceof WaitForTransactionReceiptTimeoutError) {
        throw new TimeoutError(
          `Timed out waiting for transaction ${this.#transactionHash} to settle`,
          { cause: error },
        );
      }

      throw TransportError.fromError(error);
    }
  }
}
