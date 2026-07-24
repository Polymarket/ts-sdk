import {
  approveErc20,
  approveErc1155ForAll,
  mergePositions,
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

export type SecureWalletActions = {
  /**
   * Sets up the approvals required for trading and supported position lifecycle workflows.
   *
   * @throws {@link SetupTradingApprovalsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * await client.setupTradingApprovals();
   * ```
   */
  setupTradingApprovals(): Promise<void>;
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
   *   tokenAddress: client.environment.contracts.collateralToken,
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
   * Splits collateral into market or combo positions.
   *
   * @throws {@link SplitPositionError}
   * Thrown on failure.
   *
   * @example Split a market by condition ID.
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
   *
   * @example Split a combo by legs.
   * ```ts
   * const handle = await client.splitPosition({
   *   amount: 1n,
   *   legs: ['123', '456'],
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
   * Merges complementary market or combo positions back into collateral.
   *
   * @throws {@link MergePositionsError}
   * Thrown on failure.
   *
   * @example Merge a market by condition ID.
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
   *
   * @example Merge a combo by legs.
   * ```ts
   * const handle = await client.mergePositions({
   *   amount: 'max',
   *   legs: ['123', '456'],
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
   * Redeems resolved market or combo positions.
   *
   * @throws {@link RedeemPositionsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * // Redeem a market by condition ID.
   * const handle = await client.redeemPositions({
   *   conditionId:
   *     '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
   * });
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   *
   * @example Redeem a market by market ID.
   * ```ts
   * const handle = await client.redeemPositions({
   *   marketId: '12345',
   * });
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   *
   * @example Redeem a combo by position ID.
   * ```ts
   * const handle = await client.redeemPositions({
   *   positionId: '123',
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

export function walletActions(client: BaseSecureClient): SecureWalletActions {
  return {
    setupTradingApprovals: setupTradingApprovals.bind(null, client),
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
  ApproveErc20Error,
  ApproveErc1155ForAllError,
  MergePositionsError,
  RedeemPositionsError,
  SetupTradingApprovalsError,
  SplitPositionError,
  TransferErc20Error,
} from '../actions';
