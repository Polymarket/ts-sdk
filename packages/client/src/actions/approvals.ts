import { type EvmAddress, EvmAddressSchema } from '@polymarket/bindings';
import { WalletType } from '@polymarket/bindings/gamma';
import type { EvmSignature, HexString } from '@polymarket/types';
import { z } from 'zod';
import {
  decodeErc20AllowanceResult,
  decodeErc1155IsApprovedForAllResult,
  erc20AllowanceCall,
  erc20ApprovalCall,
  erc1155ApprovalForAllCall,
  erc1155IsApprovedForAllCall,
  MAX_UINT256,
} from '../abis';
import type { BaseClient, BaseSecureClient } from '../clients';
import {
  CancelledSigningError,
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
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
  type SendErc20ApprovalTransactionRequest,
  type SendErc1155ApprovalForAllTransactionRequest,
  signerTransactionRequest,
} from '../workflow';
import {
  GaslessTransactionMetadataSchema,
  type GaslessWorkflowRequest,
  prepareGaslessTransaction,
  type WaitForGaslessTransactionError,
} from './gasless';

export type Erc20ApprovalWorkflowRequest =
  | GaslessWorkflowRequest
  | SendErc20ApprovalTransactionRequest;

export type Erc20ApprovalWorkflow = AsyncGenerator<
  Erc20ApprovalWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

const PrepareErc20ApprovalRequestSchema = z.object({
  amount: z.union([z.bigint(), z.literal('max')]),
  metadata: GaslessTransactionMetadataSchema.optional(),
  spenderAddress: EvmAddressSchema,
  tokenAddress: EvmAddressSchema,
});

export type PrepareErc20ApprovalRequest = z.input<
  typeof PrepareErc20ApprovalRequestSchema
>;

export type PrepareErc20ApprovalError = UserInputError;
export const PrepareErc20ApprovalError = makeErrorGuard(UserInputError);

/**
 * Starts an ERC-20 approval workflow.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareErc20Approval(client, {
 *   amount: 'max',
 *   spenderAddress: '0x1234…',
 *   tokenAddress: '0x5678…',
 * });
 * ```
 *
 * @throws {@link PrepareErc20ApprovalError}
 * Thrown on failure.
 */
export async function prepareErc20Approval(
  client: BaseSecureClient,
  request: PrepareErc20ApprovalRequest,
): Promise<Erc20ApprovalWorkflow> {
  const params = parseUserInput(request, PrepareErc20ApprovalRequestSchema);
  const amount = params.amount === 'max' ? MAX_UINT256 : params.amount;

  return async function* (): Erc20ApprovalWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield sendErc20ApprovalTransaction(
          signerTransactionRequest(
            client.environment.chainId,
            erc20ApprovalCall(
              params.tokenAddress,
              params.spenderAddress,
              amount,
            ),
          ),
        ),
      );
    }

    return yield* await prepareGaslessTransaction(client, {
      calls: [
        erc20ApprovalCall(params.tokenAddress, params.spenderAddress, amount),
      ],
      metadata:
        params.metadata ??
        `Approve ${params.amount} of ${params.tokenAddress} to ${params.spenderAddress}`,
    });
  }.call(null);
}

export type ApproveErc20Error =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError
  | CancelledSigningError
  | SigningError;
export const ApproveErc20Error = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Approves ERC-20 token spending for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ApproveErc20Error}
 * Thrown on failure.
 */
export function approveErc20(
  client: BaseSecureClient,
  request: PrepareErc20ApprovalRequest,
): Promise<TransactionHandle> {
  return prepareErc20Approval(client, request).then(
    completeWith(client.signer),
  );
}

export type Erc1155ApprovalForAllWorkflowRequest =
  | GaslessWorkflowRequest
  | SendErc1155ApprovalForAllTransactionRequest;

export type Erc1155ApprovalForAllWorkflow = AsyncGenerator<
  Erc1155ApprovalForAllWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

const PrepareErc1155ApprovalForAllRequestSchema = z.object({
  approved: z.boolean().default(true),
  metadata: GaslessTransactionMetadataSchema.optional(),
  operatorAddress: EvmAddressSchema,
  tokenAddress: EvmAddressSchema,
});

export type PrepareErc1155ApprovalForAllRequest = z.input<
  typeof PrepareErc1155ApprovalForAllRequestSchema
>;

export type PrepareErc1155ApprovalForAllError = UserInputError;
export const PrepareErc1155ApprovalForAllError = makeErrorGuard(UserInputError);

/**
 * Starts an ERC-1155 approval-for-all workflow.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareErc1155ApprovalForAll(client, {
 *   operatorAddress: '0x1234…',
 *   tokenAddress: '0x5678…',
 * });
 * ```
 *
 * @throws {@link PrepareErc1155ApprovalForAllError}
 * Thrown on failure.
 */
export async function prepareErc1155ApprovalForAll(
  client: BaseSecureClient,
  request: PrepareErc1155ApprovalForAllRequest,
): Promise<Erc1155ApprovalForAllWorkflow> {
  const params = parseUserInput(
    request,
    PrepareErc1155ApprovalForAllRequestSchema,
  );

  return async function* (): Erc1155ApprovalForAllWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield sendErc1155ApprovalForAllTransaction(
          signerTransactionRequest(
            client.environment.chainId,
            erc1155ApprovalForAllCall(
              params.tokenAddress,
              params.operatorAddress,
              params.approved,
            ),
          ),
        ),
      );
    }

    return yield* await prepareGaslessTransaction(client, {
      calls: [
        erc1155ApprovalForAllCall(
          params.tokenAddress,
          params.operatorAddress,
          params.approved,
        ),
      ],
      metadata:
        params.metadata ??
        `${params.approved ? 'Approve' : 'Revoke'} ${params.operatorAddress} on ${params.tokenAddress}`,
    });
  }.call(null);
}

export type ApproveErc1155ForAllError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError
  | CancelledSigningError
  | SigningError;
export const ApproveErc1155ForAllError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Approves or revokes ERC-1155 operator access for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ApproveErc1155ForAllError}
 * Thrown on failure.
 */
export function approveErc1155ForAll(
  client: BaseSecureClient,
  request: PrepareErc1155ApprovalForAllRequest,
): Promise<TransactionHandle> {
  return prepareErc1155ApprovalForAll(client, request).then(
    completeWith(client.signer),
  );
}

export type TradingApprovalsWorkflowRequest =
  | GaslessWorkflowRequest
  | SendErc20ApprovalTransactionRequest
  | SendErc1155ApprovalForAllTransactionRequest;

export type TradingApprovalsWorkflow = AsyncGenerator<
  TradingApprovalsWorkflowRequest,
  void,
  EvmAddress | EvmSignature | TransactionHandle
>;

export type PrepareTradingApprovalsError =
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareTradingApprovalsError = makeErrorGuard(
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/** An ERC-20 allowance required for supported trading workflows. */
export type Erc20TradingApproval = {
  /** Required allowance target, not the difference from the current allowance. */
  amount: bigint;
  /** Address that must be allowed to spend the token. */
  spenderAddress: EvmAddress;
  /** ERC-20 token whose allowance is required. */
  tokenAddress: EvmAddress;
};

/** An ERC-1155 operator approval required for supported trading workflows. */
export type Erc1155TradingApproval = {
  /** Address that must be approved to operate the token. */
  operatorAddress: EvmAddress;
  /** ERC-1155 token whose operator approval is required. */
  tokenAddress: EvmAddress;
};

/** Trading approval requirements grouped by token standard. */
export type TradingApprovalRequirements = {
  /** Required ERC-20 allowances. */
  erc20: Erc20TradingApproval[];
  /** Required ERC-1155 operator approvals. */
  erc1155: Erc1155TradingApproval[];
};

/** Parameters for reading a wallet's trading approval state. */
export type FetchTradingApprovalsStateRequest = {
  /** Wallet address whose trading approval state should be inspected. */
  user: string;
};

type ParsedFetchTradingApprovalsStateRequest = {
  user: EvmAddress;
};

// ZodType is covariant, so constrain the shape separately to reject
// schema-only request keys.
const FetchTradingApprovalsStateRequestSchema = z.object({
  user: EvmAddressSchema,
} satisfies Record<
  keyof FetchTradingApprovalsStateRequest,
  z.ZodType
>) satisfies z.ZodType<
  ParsedFetchTradingApprovalsStateRequest,
  FetchTradingApprovalsStateRequest
>;

/** The current trading approval state for a wallet. */
export type TradingApprovalsState = {
  /** Whether the wallet satisfies every required trading approval. */
  isFullyApproved: boolean;
  /** Approvals the wallet must grant to become fully approved. */
  missing: TradingApprovalRequirements;
};

export type FetchTradingApprovalsStateError =
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchTradingApprovalsStateError = makeErrorGuard(
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Reads the approvals a wallet is missing for supported trading workflows.
 *
 * This action only reads on-chain state. It does not require a signer or submit
 * transactions.
 *
 * @example
 * ```ts
 * const state = await fetchTradingApprovalsState(client, {
 *   user: '0x1234…',
 * });
 *
 * if (!state.isFullyApproved) {
 *   console.log(state.missing);
 * }
 * ```
 *
 * @throws {@link FetchTradingApprovalsStateError}
 * Thrown on failure.
 */
export async function fetchTradingApprovalsState(
  client: BaseClient,
  request: FetchTradingApprovalsStateRequest,
): Promise<TradingApprovalsState> {
  const { user } = parseUserInput(
    request,
    FetchTradingApprovalsStateRequestSchema,
  );
  const missing = await resolveMissingTradingApprovals(client, user);

  return {
    isFullyApproved: missing.erc20.length === 0 && missing.erc1155.length === 0,
    missing,
  };
}

/**
 * Starts a trading-setup approval workflow.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareTradingApprovals(client);
 * ```
 *
 * @throws {@link PrepareTradingApprovalsError}
 * Thrown on failure.
 */
export async function prepareTradingApprovals(
  client: BaseSecureClient,
): Promise<TradingApprovalsWorkflow> {
  const missingApprovals = await resolveMissingTradingApprovals(
    client,
    client.account.wallet,
  );
  const erc20ApprovalCalls = missingApprovals.erc20.map((approval) =>
    erc20ApprovalCall(
      approval.tokenAddress,
      approval.spenderAddress,
      approval.amount,
    ),
  );
  const erc1155ApprovalCalls = missingApprovals.erc1155.map((approval) =>
    erc1155ApprovalForAllCall(
      approval.tokenAddress,
      approval.operatorAddress,
      true,
    ),
  );

  return async function* (): TradingApprovalsWorkflow {
    if (erc20ApprovalCalls.length === 0 && erc1155ApprovalCalls.length === 0) {
      return;
    }

    if (client.account.walletType === WalletType.EOA) {
      for (const call of erc20ApprovalCalls) {
        const handle = expectTransactionHandle(
          yield sendErc20ApprovalTransaction(
            signerTransactionRequest(client.environment.chainId, call),
          ),
        );

        await handle.wait();
      }

      for (const call of erc1155ApprovalCalls) {
        const handle = expectTransactionHandle(
          yield sendErc1155ApprovalForAllTransaction(
            signerTransactionRequest(client.environment.chainId, call),
          ),
        );

        await handle.wait();
      }

      return;
    }

    const handle = yield* await prepareGaslessTransaction(client, {
      calls: [...erc20ApprovalCalls, ...erc1155ApprovalCalls],
      metadata: 'Trading setup approvals',
    });

    await handle.wait();
  }.call(null);
}

export type SetupTradingApprovalsError =
  | PrepareTradingApprovalsError
  | CancelledSigningError
  | SigningError
  | WaitForGaslessTransactionError;
export const SetupTradingApprovalsError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Sets up the approvals required for trading.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link SetupTradingApprovalsError}
 * Thrown on failure.
 */
export function setupTradingApprovals(client: BaseSecureClient): Promise<void> {
  return prepareTradingApprovals(client)
    .then(completeWith(client.signer))
    .then(() => undefined);
}

async function resolveMissingTradingApprovals(
  client: BaseClient,
  wallet: EvmAddress,
): Promise<TradingApprovalRequirements> {
  const requiredApprovals = getRequiredTradingApprovals(client);
  const checkCalls = [
    ...requiredApprovals.erc20.map((approval) =>
      erc20AllowanceCall(
        approval.tokenAddress,
        wallet,
        approval.spenderAddress,
      ),
    ),
    ...requiredApprovals.erc1155.map((approval) =>
      erc1155IsApprovedForAllCall(
        approval.tokenAddress,
        wallet,
        approval.operatorAddress,
      ),
    ),
  ];
  const results = await client.rpc.ethCallBatch(checkCalls);
  const erc20Results = results.slice(0, requiredApprovals.erc20.length);
  const erc1155Results = results.slice(requiredApprovals.erc20.length);

  try {
    return {
      erc20: requiredApprovals.erc20.filter((approval, index) => {
        const allowance = decodeErc20AllowanceResult(
          erc20Results[index] as HexString,
        );

        return allowance < approval.amount;
      }),
      erc1155: requiredApprovals.erc1155.filter((_, index) => {
        const approved = decodeErc1155IsApprovedForAllResult(
          erc1155Results[index] as HexString,
        );

        return !approved;
      }),
    };
  } catch (error) {
    throw new UnexpectedResponseError(
      'Expected JSON-RPC approval checks to return ABI-encoded values',
      { cause: error },
    );
  }
}

function getRequiredTradingApprovals(
  client: BaseClient,
): TradingApprovalRequirements {
  const { contracts } = client.environment;

  return {
    erc20: [
      {
        amount: MAX_UINT256,
        spenderAddress: contracts.standardExchange,
        tokenAddress: contracts.collateralToken,
      },
      {
        amount: MAX_UINT256,
        spenderAddress: contracts.negRiskExchange,
        tokenAddress: contracts.collateralToken,
      },
      {
        amount: MAX_UINT256,
        spenderAddress: contracts.collateralAdapter,
        tokenAddress: contracts.collateralToken,
      },
      {
        amount: MAX_UINT256,
        spenderAddress: contracts.negRiskCollateralAdapter,
        tokenAddress: contracts.collateralToken,
      },
      {
        amount: MAX_UINT256,
        spenderAddress: contracts.protocolV2Router,
        tokenAddress: contracts.collateralToken,
      },
      {
        amount: MAX_UINT256,
        spenderAddress: contracts.exchangeV3,
        tokenAddress: contracts.collateralToken,
      },
      {
        amount: MAX_UINT256,
        spenderAddress: contracts.perpsDepositContract,
        tokenAddress: contracts.collateralToken,
      },
    ],
    erc1155: [
      {
        operatorAddress: contracts.standardExchange,
        tokenAddress: contracts.conditionalTokens,
      },
      {
        operatorAddress: contracts.negRiskExchange,
        tokenAddress: contracts.conditionalTokens,
      },
      {
        operatorAddress: contracts.collateralAdapter,
        tokenAddress: contracts.conditionalTokens,
      },
      {
        operatorAddress: contracts.negRiskCollateralAdapter,
        tokenAddress: contracts.conditionalTokens,
      },
      {
        operatorAddress: contracts.autoRedeemOperator,
        tokenAddress: contracts.conditionalTokens,
      },
      {
        operatorAddress: contracts.binaryModule,
        tokenAddress: contracts.conditionalTokens,
      },
      {
        operatorAddress: contracts.negRiskModule,
        tokenAddress: contracts.conditionalTokens,
      },
      {
        operatorAddress: contracts.protocolV2Router,
        tokenAddress: contracts.positionManager,
      },
      {
        operatorAddress: contracts.exchangeV3,
        tokenAddress: contracts.positionManager,
      },
      {
        operatorAddress: contracts.autoRedeemOperator,
        tokenAddress: contracts.positionManager,
      },
    ],
  };
}

function sendErc20ApprovalTransaction(
  request: SignerTransactionRequest,
): SendErc20ApprovalTransactionRequest {
  return {
    kind: 'sendErc20ApprovalTransaction',
    request,
  };
}

function sendErc1155ApprovalForAllTransaction(
  request: SignerTransactionRequest,
): SendErc1155ApprovalForAllTransactionRequest {
  return {
    kind: 'sendErc1155ApprovalForAllTransaction',
    request,
  };
}
