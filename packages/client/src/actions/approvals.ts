import { type EvmAddress, EvmAddressSchema } from '@polymarket/bindings';
import { WalletType } from '@polymarket/bindings/gamma';
import type { EvmSignature } from '@polymarket/types';
import { z } from 'zod';
import {
  erc20ApprovalCall,
  erc1155ApprovalForAllCall,
  MAX_UINT256,
} from '../abis';
import type { BaseSecureClient } from '../clients';
import {
  CancelledSigningError,
  makeErrorGuard,
  SigningError,
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
 * This is a low-level action that most SDK consumers will not need.
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
  | PrepareErc20ApprovalError
  | CancelledSigningError
  | SigningError;
export const ApproveErc20Error = makeErrorGuard(
  CancelledSigningError,
  SigningError,
  UserInputError,
);

/**
 * Approves ERC-20 token spending for the authenticated account.
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
 * This is a low-level action that most SDK consumers will not need.
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
  | PrepareErc1155ApprovalForAllError
  | CancelledSigningError
  | SigningError;
export const ApproveErc1155ForAllError = makeErrorGuard(
  CancelledSigningError,
  SigningError,
  UserInputError,
);

/**
 * Approves or revokes ERC-1155 operator access for the authenticated account.
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

const PrepareAutoRedeemApprovalRequestSchema = z.object({
  approved: z.boolean().default(true),
  metadata: GaslessTransactionMetadataSchema.optional(),
});

export type PrepareAutoRedeemApprovalRequest = z.input<
  typeof PrepareAutoRedeemApprovalRequestSchema
>;

export type PrepareAutoRedeemApprovalError = UserInputError;
export const PrepareAutoRedeemApprovalError = makeErrorGuard(UserInputError);

/**
 * Starts an auto-redeem approval workflow.
 *
 * @remarks
 * Auto-redeem uses ERC-1155 operator approval on the authenticated account's
 * position tokens. Set `approved` to `false` to revoke the approval.
 *
 * @example
 * ```ts
 * const workflow = await prepareAutoRedeemApproval(client);
 * ```
 *
 * @throws {@link PrepareAutoRedeemApprovalError}
 * Thrown on failure.
 */
export async function prepareAutoRedeemApproval(
  client: BaseSecureClient,
  request: PrepareAutoRedeemApprovalRequest = {},
): Promise<Erc1155ApprovalForAllWorkflow> {
  const params = parseUserInput(
    request,
    PrepareAutoRedeemApprovalRequestSchema,
  );

  return prepareErc1155ApprovalForAll(client, {
    approved: params.approved,
    metadata:
      params.metadata ??
      `${params.approved ? 'Approve' : 'Revoke'} auto-redeem`,
    operatorAddress: client.environment.autoRedeemOperator,
    tokenAddress: client.environment.conditionalTokens,
  });
}

export type ApproveAutoRedeemError =
  | PrepareAutoRedeemApprovalError
  | CancelledSigningError
  | SigningError;
export const ApproveAutoRedeemError = makeErrorGuard(
  CancelledSigningError,
  SigningError,
  UserInputError,
);

/**
 * Approves or revokes auto-redeem for the authenticated account.
 *
 * @throws {@link ApproveAutoRedeemError}
 * Thrown on failure.
 */
export function approveAutoRedeem(
  client: BaseSecureClient,
  request: PrepareAutoRedeemApprovalRequest = {},
): Promise<TransactionHandle> {
  return prepareAutoRedeemApproval(client, request).then(
    completeWith(client.signer),
  );
}

export type TradingApprovalsWorkflowRequest =
  | GaslessWorkflowRequest
  | SendErc20ApprovalTransactionRequest
  | SendErc1155ApprovalForAllTransactionRequest;

export type TradingApprovalsWorkflow = AsyncGenerator<
  TradingApprovalsWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

export type PrepareTradingApprovalsError = UserInputError;
export const PrepareTradingApprovalsError = makeErrorGuard(UserInputError);

/**
 * Starts a trading-setup approval workflow.
 *
 * @remarks
 * This is a low-level action that most SDK consumers will not need.
 *
 * Prepares all approvals required for trading, including collateral and
 * position token approvals for both standard and neg-risk market flows.
 * The neg-risk adapter approvals cover split, merge, and redemption workflows
 * on neg-risk markets. Auto-redeem approval is included so accounts are ready
 * for supported position lifecycle workflows.
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
  const calls = [
    erc20ApprovalCall(
      client.environment.collateralToken,
      client.environment.standardExchange,
      MAX_UINT256,
    ),
    erc20ApprovalCall(
      client.environment.collateralToken,
      client.environment.negRiskExchange,
      MAX_UINT256,
    ),
    erc20ApprovalCall(
      client.environment.collateralToken,
      client.environment.negRiskAdapter,
      MAX_UINT256,
    ),
    erc1155ApprovalForAllCall(
      client.environment.conditionalTokens,
      client.environment.standardExchange,
      true,
    ),
    erc1155ApprovalForAllCall(
      client.environment.conditionalTokens,
      client.environment.negRiskExchange,
      true,
    ),
    erc1155ApprovalForAllCall(
      client.environment.conditionalTokens,
      client.environment.negRiskAdapter,
      true,
    ),
    erc1155ApprovalForAllCall(
      client.environment.conditionalTokens,
      client.environment.autoRedeemOperator,
      true,
    ),
  ] as const;

  return async function* (): TradingApprovalsWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      const collateralStandardApproval = expectTransactionHandle(
        yield sendErc20ApprovalTransaction(
          signerTransactionRequest(client.environment.chainId, calls[0]),
        ),
      );
      await collateralStandardApproval.wait();

      const collateralNegRiskApproval = expectTransactionHandle(
        yield sendErc20ApprovalTransaction(
          signerTransactionRequest(client.environment.chainId, calls[1]),
        ),
      );
      await collateralNegRiskApproval.wait();

      const collateralNegRiskAdapterApproval = expectTransactionHandle(
        yield sendErc20ApprovalTransaction(
          signerTransactionRequest(client.environment.chainId, calls[2]),
        ),
      );
      await collateralNegRiskAdapterApproval.wait();

      const conditionalStandardApproval = expectTransactionHandle(
        yield sendErc1155ApprovalForAllTransaction(
          signerTransactionRequest(client.environment.chainId, calls[3]),
        ),
      );
      await conditionalStandardApproval.wait();

      const conditionalNegRiskApproval = expectTransactionHandle(
        yield sendErc1155ApprovalForAllTransaction(
          signerTransactionRequest(client.environment.chainId, calls[4]),
        ),
      );
      await conditionalNegRiskApproval.wait();

      const conditionalNegRiskAdapterApproval = expectTransactionHandle(
        yield sendErc1155ApprovalForAllTransaction(
          signerTransactionRequest(client.environment.chainId, calls[5]),
        ),
      );
      await conditionalNegRiskAdapterApproval.wait();

      return expectTransactionHandle(
        yield sendErc1155ApprovalForAllTransaction(
          signerTransactionRequest(client.environment.chainId, calls[6]),
        ),
      );
    }

    return yield* await prepareGaslessTransaction(client, {
      calls: [...calls],
      metadata: 'Trading setup approvals',
    });
  }.call(null);
}

export type SetupTradingApprovalsError =
  | PrepareTradingApprovalsError
  | CancelledSigningError
  | SigningError;
export const SetupTradingApprovalsError = makeErrorGuard(
  CancelledSigningError,
  SigningError,
  UserInputError,
);

/**
 * Sets up the approvals required for trading.
 *
 * @throws {@link SetupTradingApprovalsError}
 * Thrown on failure.
 */
export function setupTradingApprovals(
  client: BaseSecureClient,
): Promise<TransactionHandle> {
  return prepareTradingApprovals(client).then(completeWith(client.signer));
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
