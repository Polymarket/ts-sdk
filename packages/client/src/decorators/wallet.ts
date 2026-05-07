import {
  approveAutoRedeem,
  approveErc20,
  approveErc1155ForAll,
  isGaslessReady,
  mergePositions,
  type PrepareAutoRedeemApprovalRequest,
  type PrepareErc20ApprovalRequest,
  type PrepareErc20TransferRequest,
  type PrepareErc1155ApprovalForAllRequest,
  type PrepareMergePositionsRequest,
  type PrepareRedeemPositionsRequest,
  type PrepareSplitPositionRequest,
  redeemPositions,
  setupTradingApprovals,
  splitPosition,
  transferErc20,
} from '../actions';
import type { BaseSecureClient } from '../clients';
import type { TransactionHandle } from '../types';

export type WalletActions = {
  /**
   * Checks whether the authenticated account wallet is ready for gasless transactions.
   *
   * @throws {@link IsGaslessReadyError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const ready = await client.isGaslessReady();
   * ```
   */
  isGaslessReady(): Promise<boolean>;
  /**
   * Sets up the approvals required for trading and supported position lifecycle workflows.
   *
   * @throws {@link SetupTradingApprovalsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const handle = await client.setupTradingApprovals();
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  setupTradingApprovals(): Promise<TransactionHandle>;
  /**
   * Approves or revokes auto-redeem for the authenticated account.
   *
   * @throws {@link ApproveAutoRedeemError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const handle = await client.approveAutoRedeem();
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  approveAutoRedeem(
    request?: PrepareAutoRedeemApprovalRequest,
  ): Promise<TransactionHandle>;
  /**
   * Approves ERC-20 token spending for the authenticated account.
   *
   * @throws {@link ApproveErc20Error}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const handle = await client.approveErc20({
   *   amount: 'max',
   *   spenderAddress: '0x1234…',
   *   tokenAddress: '0x5678…',
   * });
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  approveErc20(
    request: PrepareErc20ApprovalRequest,
  ): Promise<TransactionHandle>;
  /**
   * Approves or revokes ERC-1155 operator access for the authenticated account.
   *
   * @throws {@link ApproveErc1155ForAllError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const handle = await client.approveErc1155ForAll({
   *   operatorAddress: '0x1234…',
   *   tokenAddress: '0x5678…',
   * });
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  approveErc1155ForAll(
    request: PrepareErc1155ApprovalForAllRequest,
  ): Promise<TransactionHandle>;
  /**
   * Transfers ERC-20 tokens from the authenticated account.
   *
   * @throws {@link TransferErc20Error}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const handle = await client.transferErc20({
   *   amount: 1n,
   *   recipientAddress: client.account.signer,
   *   tokenAddress: client.environment.collateralToken,
   * });
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  transferErc20(
    request: PrepareErc20TransferRequest,
  ): Promise<TransactionHandle>;
  /**
   * Splits collateral into market positions.
   *
   * @throws {@link SplitPositionError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const handle = await client.splitPosition({
   *   amount: 1n,
   *   conditionId:
   *     '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
   * });
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  splitPosition(
    request: PrepareSplitPositionRequest,
  ): Promise<TransactionHandle>;
  /**
   * Merges complementary market positions back into collateral.
   *
   * @throws {@link MergePositionsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const handle = await client.mergePositions({
   *   amount: 'max',
   *   conditionId:
   *     '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
   * });
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  mergePositions(
    request: PrepareMergePositionsRequest,
  ): Promise<TransactionHandle>;
  /**
   * Redeems resolved market positions.
   *
   * @throws {@link RedeemPositionsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const handle = await client.redeemPositions({
   *   conditionId:
   *     '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
   * });
   *
   * const handle = await client.redeemPositions({
   *   marketId: '12345',
   * });
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  redeemPositions(
    request: PrepareRedeemPositionsRequest,
  ): Promise<TransactionHandle>;
};

export function walletActions(client: BaseSecureClient): WalletActions {
  return {
    isGaslessReady: () =>
      isGaslessReady(client, {
        wallet: client.account.wallet,
        type: client.account.walletType,
      }),
    setupTradingApprovals: setupTradingApprovals.bind(null, client),
    approveAutoRedeem: approveAutoRedeem.bind(null, client),
    approveErc20: approveErc20.bind(null, client),
    approveErc1155ForAll: approveErc1155ForAll.bind(null, client),
    transferErc20: transferErc20.bind(null, client),
    splitPosition: splitPosition.bind(null, client),
    mergePositions: mergePositions.bind(null, client),
    redeemPositions: redeemPositions.bind(null, client),
  };
}

// Error unions and runtime `isError` guards for every action bound above.
// Surfaced at the root entry point through `export * from './decorators'`.
// Keep this list in sync with the methods on SecureWalletActions.
export {
  ApproveAutoRedeemError,
  ApproveErc20Error,
  ApproveErc1155ForAllError,
  IsGaslessReadyError,
  MergePositionsError,
  RedeemPositionsError,
  SetupTradingApprovalsError,
  SplitPositionError,
  TransferErc20Error,
} from '../actions';
