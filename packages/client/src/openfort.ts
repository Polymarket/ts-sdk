import process from 'node:process';
import type { EvmAccount, Openfort } from '@openfort/openfort-node';
import {
  expectEvmAddress,
  expectEvmSignature,
  expectTxHash,
  type HexString,
  invariant,
  never,
  type TxHash,
} from '@polymarket/types';
import {
  type Chain,
  createPublicClient,
  createWalletClient,
  http,
  WaitForTransactionReceiptTimeoutError,
} from 'viem';
import { toAccount } from 'viem/accounts';
import { waitForTransactionReceipt } from 'viem/actions';
import * as viemChains from 'viem/chains';
import {
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
} from './errors';
import type {
  Signer,
  SignerTransactionRequest,
  TransactionHandle,
  TransactionOutcome,
  TypedDataPayload,
} from './types';

invariant(
  process.release.name === 'node',
  'The @polymarket/client/openfort entrypoint requires a Node.js runtime.',
);
invariant(
  typeof window === 'undefined' && typeof document === 'undefined',
  'The @polymarket/client/openfort entrypoint cannot be imported in a browser-like runtime.',
);

export type OpenfortWalletConfig = {
  openfort: Openfort;
  /** The Openfort EVM backend wallet account ID (starts with `acc_`). */
  accountId: string;
};

const allChains = Object.values(viemChains) as Chain[];

/**
 * Creates a signer backed by an Openfort EVM backend wallet.
 *
 * Signing requests are executed by the Openfort backend wallet, so private
 * key material never leaves the wallet infrastructure. Transactions are
 * prepared and broadcast directly to the blockchain, with the transaction
 * signed by the backend wallet.
 *
 * @example
 * ```ts
 * const secureClient = await createSecureClient({
 *   signer: signerFrom({
 *     openfort: new Openfort(process.env.OPENFORT_SECRET_KEY, {
 *       walletSecret: process.env.OPENFORT_WALLET_SECRET,
 *     }),
 *     accountId: 'acc_...',
 *   }),
 * });
 * ```
 */
export function signerFrom(config: OpenfortWalletConfig): Signer {
  let accountPromise: Promise<EvmAccount> | undefined;

  function resolveAccount(): Promise<EvmAccount> {
    accountPromise ??= config.openfort.accounts.evm.backend
      .get({ id: config.accountId })
      .catch((error: unknown) => {
        // Drop the cached promise so a later call can retry.
        accountPromise = undefined;
        throw SigningError.fromError(
          error,
          `Could not resolve Openfort backend wallet ${config.accountId}`,
        );
      });

    return accountPromise;
  }

  return {
    async getAddress() {
      return expectEvmAddress((await resolveAccount()).address);
    },
    async signTypedData(payload) {
      return signTypedData(await resolveAccount(), payload);
    },
    async signMessage(message) {
      return signMessage(await resolveAccount(), message);
    },
    async sendTransaction(request) {
      return new DirectTransactionHandle(
        await sendTransaction(await resolveAccount(), request),
        request.chainId,
      );
    },
  };
}

async function signTypedData(account: EvmAccount, payload: TypedDataPayload) {
  try {
    const signature = await account.signTypedData({
      domain: payload.domain,
      message: payload.message,
      primaryType: payload.primaryType,
      types: payload.types as Record<
        string,
        Array<{ name: string; type: string }>
      >,
    });

    return expectEvmSignature(signature);
  } catch (error) {
    throw SigningError.fromError(error);
  }
}

async function signMessage(account: EvmAccount, message: HexString) {
  try {
    const signature = await account.signMessage({
      message: { raw: message },
    });

    return expectEvmSignature(signature);
  } catch (error) {
    throw SigningError.fromError(error);
  }
}

async function sendTransaction(
  account: EvmAccount,
  request: SignerTransactionRequest,
): Promise<TxHash> {
  try {
    const walletClient = createWalletClient({
      account: toAccount({
        address: account.address,
        signMessage(parameters) {
          return account.signMessage(parameters);
        },
        signTransaction(transaction) {
          return account.signTransaction(transaction);
        },
        signTypedData(typedData) {
          return account.signTypedData(typedData);
        },
      }),
      chain: resolveChain(request.chainId),
      transport: http(),
    });

    const hash = await walletClient.sendTransaction({
      data: request.data,
      to: request.to,
      value: request.value,
    });

    return expectTxHash(hash);
  } catch (error) {
    throw SigningError.fromError(error);
  }
}

class DirectTransactionHandle implements TransactionHandle {
  readonly transactionId = null;

  readonly #chainId: number;
  #transactionHash: TxHash;

  constructor(transactionHash: TxHash, chainId: number) {
    this.#chainId = chainId;
    this.#transactionHash = transactionHash;
  }

  get transactionHash() {
    return this.#transactionHash;
  }

  async wait(): Promise<TransactionOutcome> {
    try {
      const receipt = await waitForTransactionReceipt(
        createPublicClient({
          chain: resolveChain(this.#chainId),
          transport: http(),
        }),
        {
          hash: this.#transactionHash,
        },
      );

      const transactionHash = expectTxHash(receipt.transactionHash);
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

function resolveChain(chainId: number) {
  const chain = allChains.find((candidate) => candidate.id === chainId);

  if (chain !== undefined) {
    return chain;
  }

  never(
    `Unsupported chain ID for direct Openfort transaction wait: ${chainId}`,
  );
}
