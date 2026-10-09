import {
  approveErc20,
  approveErc1155ForAll,
  type CollateralReturnPlanResponse,
  composeThreshold,
  convertPosition,
  decomposeThreshold,
  type ExecuteCollateralReturnPlanRequest,
  executeCollateralReturnPlan,
  type FetchTradingApprovalsStateRequest,
  fetchTradingApprovalsState,
  mergeDirectionalPositions,
  mergeEventPositions,
  mergePositions,
  type PrepareComposeThresholdRequest,
  type PrepareConvertPositionRequest,
  type PrepareDecomposeThresholdRequest,
  type PrepareErc20ApprovalRequest,
  type PrepareErc20TransferRequest,
  type PrepareErc1155ApprovalForAllRequest,
  type PrepareMergeDirectionalPositionsRequest,
  type PrepareMergeEventPositionsRequest,
  type PrepareMergePositionsRequest,
  type PrepareRedeemPositionsRequest,
  type PrepareSplitDirectionalPositionsRequest,
  type PrepareSplitEventPositionsRequest,
  type PrepareSplitPositionRequest,
  planCollateralReturn,
  redeemPositions,
  setupTradingApprovals,
  splitDirectionalPositions,
  splitEventPositions,
  splitPosition,
  type TradingApprovalsState,
  transferErc20,
} from '../actions';
import type {
  BaseClient,
  BasePublicClient,
  BaseSecureClient,
} from '../clients';
import type { TransactionHandle } from '../types';

export type PublicWalletActions = {
  /**
   * Reads the approvals a wallet is missing for supported trading workflows.
   *
   * Reads the wallet's current approval state. Recent grants and revocations
   * may take time to appear. It does not require a signer or submit
   * transactions. Trading setup re-checks approvals before preparing them.
   *
   * @throws {@link FetchTradingApprovalsStateError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const state = await client.fetchTradingApprovalsState({
   *   user: '0x1234…',
   * });
   * ```
   */
  fetchTradingApprovalsState(
    request: FetchTradingApprovalsStateRequest,
  ): Promise<TradingApprovalsState>;
};

export type SecureWalletActions = {
  /**
   * Reads the approvals a wallet is missing for supported trading workflows.
   *
   * Reads the authenticated account's wallet approval state. Recent grants
   * and revocations may take time to appear. It does not submit transactions.
   * Trading setup re-checks approvals before preparing them.
   *
   * @throws {@link FetchTradingApprovalsStateError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const state = await client.fetchTradingApprovalsState();
   * ```
   */
  fetchTradingApprovalsState(): Promise<TradingApprovalsState>;
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
   * Splits collateral into positions.
   *
   * Structured V2 condition IDs support native directional buckets, Void, and
   * thresholds directly. A threshold produces complementary ABOVE/BELOW positions.
   *
   * @throws {@link SplitPositionError}
   * Thrown on failure.
   *
   * @example Split a market by condition ID.
   * ```ts
   * const handle = await client.splitPosition({
   *   amount: 1n,
   *   conditionId: '0x123…',
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
   * Merges complementary positions back into collateral.
   *
   * Structured V2 condition IDs support native directional buckets, Void, and
   * thresholds directly. A threshold consumes complementary ABOVE/BELOW positions.
   *
   * @throws {@link MergePositionsError}
   * Thrown on failure.
   *
   * @example Merge a market by condition ID.
   * ```ts
   * const handle = await client.mergePositions({
   *   amount: 'max',
   *   conditionId: '0x123…',
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
   * Redeems held positions for a market or a specific position by ID.
   *
   * Native directional bucket, Void, and threshold IDs work directly; redemption
   * availability is determined by the protocol result for each selected position.
   *
   * @throws {@link RedeemPositionsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * // Redeem a market by condition ID.
   * const handle = await client.redeemPositions({
   *   conditionId: '0x123…',
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
   * @example Redeem a Polymarket V2 position by position ID.
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
  /**
   * Splits collateral into the complete YES set of a multi-outcome event.
   *
   * Accepts neg-risk and directional protocol event IDs. The set includes the
   * synthetic Other or Void position.
   *
   * @throws {@link SplitEventPositionsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const handle = await client.splitEventPositions({
   *   amount: 1_000_000n,
   *   eventId: '0x04…',
   * });
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  splitEventPositions(
    request: PrepareSplitEventPositionsRequest,
  ): Promise<TransactionHandle>;
  /**
   * Merges the complete YES set of a multi-outcome event back into collateral.
   *
   * Consumes every real YES position and the synthetic Other or Void position.
   * Use `'max'` to merge the minimum held balance across the set.
   *
   * @throws {@link MergeEventPositionsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const handle = await client.mergeEventPositions({
   *   amount: 'max',
   *   eventId: '0x04…',
   * });
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  mergeEventPositions(
    request: PrepareMergeEventPositionsRequest,
  ): Promise<TransactionHandle>;
  /**
   * Converts a NO position into YES positions for every other outcome in its
   * event.
   *
   * Accepts NO positions of neg-risk conditions and directional buckets,
   * including Other or Void. Threshold positions cannot be converted. Use
   * `'max'` to convert the full held balance.
   *
   * @throws {@link ConvertPositionError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const { noPositionId } = deriveDirectionalBucketPositions({
   *   bucketIndex: 1,
   *   eventId: '0x04…',
   * });
   *
   * const handle = await client.convertPosition({
   *   amount: 'max',
   *   positionId: noPositionId,
   * });
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  convertPosition(
    request: PrepareConvertPositionRequest,
  ): Promise<TransactionHandle>;
  /**
   * Composes bucket YES positions into one side of a directional threshold.
   *
   * ABOVE consumes the real buckets at or past the line. BELOW consumes the
   * real buckets before the line and Void. Use `'max'` to compose the minimum
   * held balance across the basket.
   *
   * @throws {@link ComposeThresholdError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const handle = await client.composeThreshold({
   *   amount: 'max',
   *   eventId: '0x04…',
   *   line: 2,
   *   side: ThresholdSide.Below,
   * });
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  composeThreshold(
    request: PrepareComposeThresholdRequest,
  ): Promise<TransactionHandle>;
  /**
   * Decomposes one side of a directional threshold into its bucket YES
   * positions.
   *
   * ABOVE returns the real buckets at or past the line. BELOW returns the real
   * buckets before the line and Void. Use `'max'` to decompose the full held
   * balance.
   *
   * @throws {@link DecomposeThresholdError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const handle = await client.decomposeThreshold({
   *   amount: 'max',
   *   eventId: '0x04…',
   *   line: 2,
   *   side: ThresholdSide.Below,
   * });
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  decomposeThreshold(
    request: PrepareDecomposeThresholdRequest,
  ): Promise<TransactionHandle>;
  /**
   * Splits collateral and middle-bucket YES positions into ABOVE at `lowLine`
   * and BELOW at `highLine`.
   *
   * Consumes `amount` of collateral and of each real bucket YES position in
   * `[lowLine, highLine)`. Lines are ordinal bucket boundaries.
   *
   * @throws {@link SplitDirectionalPositionsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const handle = await client.splitDirectionalPositions({
   *   amount: 1_000_000n,
   *   eventId: '0x04…',
   *   highLine: 3,
   *   lowLine: 1,
   * });
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  splitDirectionalPositions(
    request: PrepareSplitDirectionalPositionsRequest,
  ): Promise<TransactionHandle>;
  /**
   * Merges ABOVE at `lowLine` and BELOW at `highLine` into collateral and
   * middle-bucket YES positions.
   *
   * Returns `amount` of collateral and of each real bucket YES position in
   * `[lowLine, highLine)`. Use `'max'` to merge the minimum held balance of
   * the two threshold positions.
   *
   * @throws {@link MergeDirectionalPositionsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const handle = await client.mergeDirectionalPositions({
   *   amount: 'max',
   *   eventId: '0x04…',
   *   highLine: 3,
   *   lowLine: 1,
   * });
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  mergeDirectionalPositions(
    request: PrepareMergeDirectionalPositionsRequest,
  ): Promise<TransactionHandle>;
  /**
   * Plans a collateral return for the authenticated account.
   *
   * The returned plan is an inspectable artifact: review the collateral it
   * releases, the inputs it consumes, and the residual-position impact, and
   * apply any application-specific limits before executing it with
   * {@link SecureWalletActions.executeCollateralReturnPlan | executeCollateralReturnPlan}.
   * A truncated plan is one executable chunk of a larger return; execute and
   * confirm it before requesting the next plan.
   *
   * @throws {@link PlanCollateralReturnError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * let plan: CollateralReturnPlanResponse;
   *
   * do {
   *   plan = await client.planCollateralReturn();
   *
   *   // Inspect the return and residual-position impact, and apply any
   *   // application-specific limits before signing.
   *   const handle = await client.executeCollateralReturnPlan({ plan });
   *   await handle.wait();
   * } while (plan.truncated);
   * ```
   */
  planCollateralReturn(): Promise<CollateralReturnPlanResponse>;
  /**
   * Executes a collateral return plan for the authenticated account.
   *
   * Execution signs and submits the exact call carried by the plan; nothing is
   * recomputed on the client, and no approval transactions are run implicitly.
   * Confirmation stays explicit through the returned handle's `wait()`.
   *
   * If wallet state changed since the plan was created, the service rejects
   * the submission; request a fresh plan and execute that instead.
   *
   * @throws {@link ExecuteCollateralReturnPlanError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const plan = await client.planCollateralReturn();
   *
   * const handle = await client.executeCollateralReturnPlan({ plan });
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  executeCollateralReturnPlan(
    request: ExecuteCollateralReturnPlanRequest,
  ): Promise<TransactionHandle>;
};

function publicWalletActions(client: BaseClient): PublicWalletActions {
  return {
    fetchTradingApprovalsState: fetchTradingApprovalsState.bind(null, client),
  };
}

export function walletActions(client: BasePublicClient): PublicWalletActions;
export function walletActions(client: BaseSecureClient): SecureWalletActions;
export function walletActions(
  client: BaseClient,
): PublicWalletActions | SecureWalletActions {
  const actions = publicWalletActions(client);

  if (client.isPublicClient()) {
    return actions;
  }

  return {
    ...actions,
    fetchTradingApprovalsState: () =>
      fetchTradingApprovalsState(client, { user: client.account.wallet }),
    setupTradingApprovals: setupTradingApprovals.bind(null, client),
    approveErc20: approveErc20.bind(null, client),
    approveErc1155ForAll: approveErc1155ForAll.bind(null, client),
    transferErc20: transferErc20.bind(null, client),
    splitPosition: splitPosition.bind(null, client),
    mergePositions: mergePositions.bind(null, client),
    redeemPositions: redeemPositions.bind(null, client),
    splitEventPositions: splitEventPositions.bind(null, client),
    mergeEventPositions: mergeEventPositions.bind(null, client),
    convertPosition: convertPosition.bind(null, client),
    composeThreshold: composeThreshold.bind(null, client),
    decomposeThreshold: decomposeThreshold.bind(null, client),
    splitDirectionalPositions: splitDirectionalPositions.bind(null, client),
    mergeDirectionalPositions: mergeDirectionalPositions.bind(null, client),
    planCollateralReturn: planCollateralReturn.bind(null, client),
    executeCollateralReturnPlan: executeCollateralReturnPlan.bind(null, client),
  };
}

// Public collateral-return model types surfaced alongside the bound methods.
export type {
  CollateralReturnOperation,
  CollateralReturnOperationKind,
  CollateralReturnPlanResponse,
  CollateralReturnPositionAmount,
  CollateralReturnPositionSummary,
  CollateralReturnRouterCall,
  Erc20TradingApproval,
  Erc1155TradingApproval,
  ExecuteCollateralReturnPlanRequest,
  FetchTradingApprovalsStateRequest,
  PrepareComposeThresholdRequest,
  PrepareConvertPositionRequest,
  PrepareDecomposeThresholdRequest,
  PrepareMergeDirectionalPositionsRequest,
  PrepareMergeEventPositionsRequest,
  PrepareSplitDirectionalPositionsRequest,
  PrepareSplitEventPositionsRequest,
  TradingApprovalRequirements,
  TradingApprovalsState,
} from '../actions';
// Error unions and runtime `isError` guards for every action bound above.
// Surfaced at the root entry point through `export * from './decorators'`.
// Keep this list in sync with the methods on SecureWalletActions.
export {
  ApproveErc20Error,
  ApproveErc1155ForAllError,
  CollateralReturnKnownOperationKind,
  ComposeThresholdError,
  ConvertPositionError,
  DecomposeThresholdError,
  ExecuteCollateralReturnPlanError,
  FetchTradingApprovalsStateError,
  MergeDirectionalPositionsError,
  MergeEventPositionsError,
  MergePositionsError,
  PlanCollateralReturnError,
  RedeemPositionsError,
  SetupTradingApprovalsError,
  SplitDirectionalPositionsError,
  SplitEventPositionsError,
  SplitPositionError,
  TransferErc20Error,
} from '../actions';
