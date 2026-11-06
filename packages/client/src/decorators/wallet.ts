import {
  approveErc20,
  approveErc1155ForAll,
  type FetchTradingApprovalsStateRequest,
  fetchTradingApprovalsState,
  type PrepareErc20ApprovalRequest,
  type PrepareErc1155ApprovalForAllRequest,
  setupTradingApprovals,
  type TradingApprovalsState,
} from '../actions/approvals';
import {
  type CollateralReturnPlanResponse,
  type ExecuteCollateralReturnPlanRequest,
  executeCollateralReturnPlan,
  planCollateralReturn,
} from '../actions/collateral-return';
import {
  type ComposeThresholdWorkflow,
  composeThreshold,
  type DecomposeThresholdWorkflow,
  decomposeThreshold,
  type MergeDirectionalWorkflow,
  mergeDirectional,
  type PrepareComposeThresholdRequest,
  type PrepareDecomposeThresholdRequest,
  prepareComposeThreshold,
  prepareDecomposeThreshold,
  prepareMergeDirectional,
  prepareSplitDirectional,
  type SplitDirectionalWorkflow,
  splitDirectional,
} from '../actions/directional';
import {
  type DirectionalBulkResult,
  mergeAllUserPositionsDirectional,
  splitAllUserPositionsDirectional,
} from '../actions/directional-bulk';
import {
  type DirectionalBucketHolding,
  type DirectionalPair,
  type FindDirectionalBucketsRequest,
  type FindDirectionalPairsRequest,
  findDirectionalBuckets,
  findDirectionalPairs,
} from '../actions/directional-pairs';
import {
  type ConvertPositionWorkflow,
  convertPosition,
  type MergeEventPositionsWorkflow,
  mergeEventPositions,
  type PrepareConvertPositionRequest,
  type PrepareMergeEventPositionsRequest,
  type PrepareSplitEventPositionsRequest,
  prepareConvertPosition,
  prepareMergeEventPositions,
  prepareSplitEventPositions,
  type SplitEventPositionsWorkflow,
  splitEventPositions,
} from '../actions/event-positions';
import {
  type ConvertWorkflow,
  convert,
  type HorizontalMergeWorkflow,
  type HorizontalSplitWorkflow,
  horizontalMerge,
  horizontalSplit,
  type PrepareConvertRequest,
  type PrepareHorizontalMergeRequest,
  type PrepareHorizontalSplitRequest,
  prepareConvert,
  prepareHorizontalMerge,
  prepareHorizontalSplit,
} from '../actions/neg-risk';
import {
  mergePositions,
  type PrepareMergePositionsRequest,
  type PrepareRedeemPositionsRequest,
  type PrepareSplitPositionRequest,
  redeemPositions,
  splitPosition,
} from '../actions/positions';
import {
  type PrepareErc20TransferRequest,
  transferErc20,
} from '../actions/transfers';
import type {
  BaseClient,
  BasePublicClient,
  BaseSecureClient,
} from '../clients';
import type { RequestOptions } from '../request-options';
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
    options?: RequestOptions,
  ): Promise<TradingApprovalsState>;
};

export type SecureWalletActions = {
  /**
   * Returns collateral from indexed threshold holdings, choosing the largest
   * return first. Confirms each merge and rediscovers before the next.
   * Uses existing approvals. Greedy selection does not guarantee a global optimum.
   * Returns outcomes and errors. Skips failed pairs and retries transient reads.
   * Uncertain transactions pause submissions; confirmed transactions persist.
   * Operational failures are reported in the returned errors array.
   */
  mergeAllUserPositionsDirectional(): Promise<DirectionalBulkResult>;
  /**
   * Spends available collateral and indexed middle-bucket YES holdings to restore
   * threshold pairs. Chooses the largest feasible amount, widest range on ties,
   * confirms each split, then rediscovers until inventory or collateral is exhausted.
   * Uses existing approvals. Does not reconstruct a particular previous merge.
   * Returns outcomes and errors. Skips failed pairs and retries transient reads.
   * Uncertain transactions pause submissions; confirmed transactions persist.
   * Operational failures are reported in the returned errors array.
   */
  splitAllUserPositionsDirectional(): Promise<DirectionalBulkResult>;
  /**
   * Finds indexed middle-bucket YES holdings with fresh balances and the pUSD
   * needed to split each full holding into adjacent threshold wings.
   * Ranks by balance descending. Does not read or filter by wallet pUSD balance.
   * Only indexed positive splittable bucket YES holdings are returned.
   * @throws {@link FindDirectionalBucketsError} Thrown on invalid input, read failure or incomplete pagination.
   */
  findDirectionalBuckets(
    request?: FindDirectionalBucketsRequest,
    options?: RequestOptions,
  ): Promise<DirectionalBucketHolding[]>;
  /**
   * Finds collateral-return pairs in this wallet's indexed holdings, with fresh on-chain balances.
   * Pairs may overlap; their amounts cannot be added into an execution plan.
   * Unindexed holdings cannot be discovered. No funds are moved.
   * @throws {@link FindDirectionalPairsError} Thrown on failure or incomplete pagination.
   */
  findDirectionalPairs(
    request?: FindDirectionalPairsRequest,
  ): Promise<DirectionalPair[]>;
  /**
   * Prepares the signing steps for {@link SecureWalletActions.composeThreshold | composeThreshold}.
   * Does not submit until the workflow is advanced.
   * @throws {@link PrepareComposeThresholdError} Thrown on failure, including while advancing the workflow.
   */
  prepareComposeThreshold(
    request: PrepareComposeThresholdRequest,
  ): Promise<ComposeThresholdWorkflow>;
  /**
   * Prepares the signing steps for {@link SecureWalletActions.decomposeThreshold | decomposeThreshold}.
   * Does not submit until the workflow is advanced.
   * @throws {@link PrepareDecomposeThresholdError} Thrown on failure, including while advancing the workflow.
   */
  prepareDecomposeThreshold(
    request: PrepareDecomposeThresholdRequest,
  ): Promise<DecomposeThresholdWorkflow>;
  /**
   * Prepares the signing steps for {@link SecureWalletActions.splitDirectional | splitDirectional}.
   * Accepts threshold position IDs in either order. Amount uses six-decimal
   * bigint base units; omitted or 'max' uses available collateral and bucket balances.
   * Does not submit until the workflow is advanced.
   * @throws {@link PrepareSplitDirectionalError} Thrown on failure, including while advancing the workflow.
   */
  prepareSplitDirectional(
    positionIdA: string,
    positionIdB: string,
    amount?: bigint | 'max',
  ): Promise<SplitDirectionalWorkflow>;
  /**
   * Prepares the signing steps for {@link SecureWalletActions.mergeDirectional | mergeDirectional}.
   * Accepts threshold position IDs in either order. Amount uses six-decimal
   * bigint base units; omitted or 'max' uses the minimum held threshold balance.
   * Does not submit until the workflow is advanced.
   * @throws {@link PrepareMergeDirectionalError} Thrown on failure, including while advancing the workflow.
   */
  prepareMergeDirectional(
    positionIdA: string,
    positionIdB: string,
    amount?: bigint | 'max',
  ): Promise<MergeDirectionalWorkflow>;
  /**
   * Prepares the signing steps for {@link SecureWalletActions.splitEventPositions | splitEventPositions}.
   * Does not submit until the workflow is advanced.
   * @throws {@link PrepareSplitEventPositionsError} Thrown on failure, including while advancing the workflow.
   */
  prepareSplitEventPositions(
    request: PrepareSplitEventPositionsRequest,
  ): Promise<SplitEventPositionsWorkflow>;
  /**
   * Prepares the signing steps for {@link SecureWalletActions.mergeEventPositions | mergeEventPositions}.
   * Does not submit until the workflow is advanced.
   * @throws {@link PrepareMergeEventPositionsError} Thrown on failure, including while advancing the workflow.
   */
  prepareMergeEventPositions(
    request: PrepareMergeEventPositionsRequest,
  ): Promise<MergeEventPositionsWorkflow>;
  /**
   * Prepares the signing steps for {@link SecureWalletActions.convertPosition | convertPosition}.
   * Does not submit until the workflow is advanced.
   * @throws {@link PrepareConvertPositionError} Thrown on failure, including while advancing the workflow.
   */
  prepareConvertPosition(
    request: PrepareConvertPositionRequest,
  ): Promise<ConvertPositionWorkflow>;

  /**
   * Converts NO into YES for all other conditions.
   * Derives the event and NO condition index from the market's condition ID.
   * Includes Other unless converting NO(Other).
   * Requires PositionManager operator approval for the Router; approvals are not submitted automatically.
   * Signs and submits; call the returned handle's wait() to confirm.
   * @throws {@link ConvertError} Thrown on failure.
   */
  convert(request: PrepareConvertRequest): Promise<TransactionHandle>;
  /**
   * Prepares a workflow: Converts NO into YES for all other conditions.
   * Derives the event and NO condition index from the market's condition ID.
   * Includes Other unless converting NO(Other).
   * Requires PositionManager operator approval for the Router; approvals are not submitted automatically.
   * Preparing does not sign or submit; advance the workflow to execute it.
   * @throws {@link PrepareConvertError} Thrown on failure.
   */
  prepareConvert(request: PrepareConvertRequest): Promise<ConvertWorkflow>;
  /**
   * Splits pUSD into YES for every condition, including Other.
   * Uses the event containing the supplied market condition.
   * Requires pUSD spending approval for the Router; approvals are not submitted automatically.
   * Signs and submits; call the returned handle's wait() to confirm.
   * @throws {@link HorizontalSplitError} Thrown on failure.
   */
  horizontalSplit(
    request: PrepareHorizontalSplitRequest,
  ): Promise<TransactionHandle>;
  /**
   * Prepares a workflow: Splits pUSD into YES for every condition, including Other.
   * Uses the event containing the supplied market condition.
   * Requires pUSD spending approval for the Router; approvals are not submitted automatically.
   * Preparing does not sign or submit; advance the workflow to execute it.
   * @throws {@link PrepareHorizontalSplitError} Thrown on failure.
   */
  prepareHorizontalSplit(
    request: PrepareHorizontalSplitRequest,
  ): Promise<HorizontalSplitWorkflow>;
  /**
   * Merges equal YES amounts from every condition, including Other, into pUSD.
   * Uses the event containing the supplied market condition.
   * Requires PositionManager operator approval for the Router; approvals are not submitted automatically.
   * Signs and submits; call the returned handle's wait() to confirm.
   * @throws {@link HorizontalMergeError} Thrown on failure.
   */
  horizontalMerge(
    request: PrepareHorizontalMergeRequest,
  ): Promise<TransactionHandle>;
  /**
   * Prepares a workflow: Merges equal YES amounts from every condition, including Other, into pUSD.
   * Uses the event containing the supplied market condition.
   * Requires PositionManager operator approval for the Router; approvals are not submitted automatically.
   * Preparing does not sign or submit; advance the workflow to execute it.
   * @throws {@link PrepareHorizontalMergeError} Thrown on failure.
   */
  prepareHorizontalMerge(
    request: PrepareHorizontalMergeRequest,
  ): Promise<HorizontalMergeWorkflow>;

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
  fetchTradingApprovalsState(
    options?: RequestOptions,
  ): Promise<TradingApprovalsState>;
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
   * Directional bucket, Void, and threshold condition IDs work without a market
   * listing. A threshold produces complementary ABOVE/BELOW positions.
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
   * Directional bucket, Void, and threshold condition IDs work without a market
   * listing. A threshold consumes complementary ABOVE/BELOW positions.
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
   * Directional bucket, Void, and threshold IDs work without a market listing.
   * Whether a directional position can be redeemed yet is decided on chain.
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
   * Splits collateral into the complete YES set of a directional event.
   *
   * The set includes every real bucket and the Void bucket.
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
   * Merges the complete YES set of a directional event back into collateral.
   *
   * Consumes every real bucket YES position and the Void YES position.
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
   * Converts a directional bucket NO position into YES positions for every
   * other bucket in its event.
   *
   * Accepts real bucket and Void NO positions. Threshold positions cannot be
   * converted. Use
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
   * `[lowLine, highLine)`. Omit amount or use 'max' for the minimum of
   * pUSD and every required bucket balance. Amounts use six-decimal bigint base units.
   * The two position IDs may be in either order; they must identify ABOVE on a
   * lower threshold and BELOW on a higher threshold in the same directional event.
   *
   * @throws {@link SplitDirectionalError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const handle = await client.splitDirectional(positionIdA, positionIdB, 1_000_000n);
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  splitDirectional(
    positionIdA: string,
    positionIdB: string,
    amount?: bigint | 'max',
  ): Promise<TransactionHandle>;
  /**
   * Merges ABOVE at `lowLine` and BELOW at `highLine` into collateral and
   * middle-bucket YES positions.
   *
   * Returns `amount` of collateral and of each real bucket YES position in
   * `[lowLine, highLine)`. Omit amount or use `'max'` to merge the minimum held balance of
   * the two threshold positions. Amounts use six-decimal bigint base units.
   * The two position IDs may be in either order; they must identify ABOVE on a
   * lower threshold and BELOW on a higher threshold in the same directional event.
   *
   * @throws {@link MergeDirectionalError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const handle = await client.mergeDirectional(positionIdA, positionIdB, 1_000_000n);
   *
   * const outcome = await handle.wait();
   *
   * // outcome.transactionHash: TxHash
   * ```
   */
  mergeDirectional(
    positionIdA: string,
    positionIdB: string,
    amount?: bigint | 'max',
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
    fetchTradingApprovalsState: (options?: RequestOptions) =>
      fetchTradingApprovalsState(
        client,
        { user: client.account.wallet },
        options,
      ),
    setupTradingApprovals: setupTradingApprovals.bind(null, client),
    approveErc20: approveErc20.bind(null, client),
    approveErc1155ForAll: approveErc1155ForAll.bind(null, client),
    transferErc20: transferErc20.bind(null, client),
    convert: convert.bind(null, client),
    prepareConvert: prepareConvert.bind(null, client),
    horizontalSplit: horizontalSplit.bind(null, client),
    prepareHorizontalSplit: prepareHorizontalSplit.bind(null, client),
    horizontalMerge: horizontalMerge.bind(null, client),
    prepareHorizontalMerge: prepareHorizontalMerge.bind(null, client),
    splitPosition: splitPosition.bind(null, client),
    mergePositions: mergePositions.bind(null, client),
    redeemPositions: redeemPositions.bind(null, client),
    prepareComposeThreshold: prepareComposeThreshold.bind(null, client),
    prepareDecomposeThreshold: prepareDecomposeThreshold.bind(null, client),
    prepareSplitDirectional: prepareSplitDirectional.bind(null, client),
    prepareMergeDirectional: prepareMergeDirectional.bind(null, client),
    prepareSplitEventPositions: prepareSplitEventPositions.bind(null, client),
    prepareMergeEventPositions: prepareMergeEventPositions.bind(null, client),
    prepareConvertPosition: prepareConvertPosition.bind(null, client),
    splitEventPositions: splitEventPositions.bind(null, client),
    mergeEventPositions: mergeEventPositions.bind(null, client),
    convertPosition: convertPosition.bind(null, client),
    composeThreshold: composeThreshold.bind(null, client),
    decomposeThreshold: decomposeThreshold.bind(null, client),
    findDirectionalBuckets: findDirectionalBuckets.bind(null, client),
    findDirectionalPairs: findDirectionalPairs.bind(null, client),
    mergeAllUserPositionsDirectional: mergeAllUserPositionsDirectional.bind(
      null,
      client,
    ),
    splitAllUserPositionsDirectional: splitAllUserPositionsDirectional.bind(
      null,
      client,
    ),
    splitDirectional: splitDirectional.bind(null, client),
    mergeDirectional: mergeDirectional.bind(null, client),
    planCollateralReturn: planCollateralReturn.bind(null, client),
    executeCollateralReturnPlan: executeCollateralReturnPlan.bind(null, client),
  };
}

export type {
  Erc20TradingApproval,
  Erc1155TradingApproval,
  FetchTradingApprovalsStateRequest,
  TradingApprovalRequirements,
  TradingApprovalsState,
} from '../actions/approvals';
// Error unions and runtime `isError` guards for every action bound above.
// Surfaced at the root entry point through `export * from './decorators'`.
// Keep this list in sync with the methods on SecureWalletActions.
export {
  ApproveErc20Error,
  ApproveErc1155ForAllError,
  FetchTradingApprovalsStateError,
  SetupTradingApprovalsError,
} from '../actions/approvals';
// Public collateral-return model types surfaced alongside the bound methods.
export type {
  CollateralReturnOperation,
  CollateralReturnOperationKind,
  CollateralReturnPlanResponse,
  CollateralReturnPositionAmount,
  CollateralReturnPositionSummary,
  CollateralReturnRouterCall,
  ExecuteCollateralReturnPlanRequest,
} from '../actions/collateral-return';
export {
  CollateralReturnKnownOperationKind,
  ExecuteCollateralReturnPlanError,
  PlanCollateralReturnError,
} from '../actions/collateral-return';
export type {
  ComposeThresholdWorkflow,
  DecomposeThresholdWorkflow,
  MergeDirectionalWorkflow,
  PrepareComposeThresholdRequest,
  PrepareDecomposeThresholdRequest,
  SplitDirectionalWorkflow,
} from '../actions/directional';
export {
  ComposeThresholdError,
  DecomposeThresholdError,
  MergeDirectionalError,
  PrepareComposeThresholdError,
  PrepareDecomposeThresholdError,
  PrepareMergeDirectionalError,
  PrepareSplitDirectionalError,
  SplitDirectionalError,
} from '../actions/directional';
export {
  type DirectionalBulkFailure,
  type DirectionalBulkResult,
  MergeAllUserPositionsDirectionalError,
  SplitAllUserPositionsDirectionalError,
} from '../actions/directional-bulk';
export type {
  DirectionalBucketHolding,
  DirectionalPair,
  FindDirectionalBucketsRequest,
  FindDirectionalPairsRequest,
} from '../actions/directional-pairs';
export {
  FindDirectionalBucketsError,
  FindDirectionalPairsError,
} from '../actions/directional-pairs';
export type {
  ConvertPositionWorkflow,
  MergeEventPositionsWorkflow,
  PrepareConvertPositionRequest,
  PrepareMergeEventPositionsRequest,
  PrepareSplitEventPositionsRequest,
  SplitEventPositionsWorkflow,
} from '../actions/event-positions';
export {
  ConvertPositionError,
  MergeEventPositionsError,
  PrepareConvertPositionError,
  PrepareMergeEventPositionsError,
  PrepareSplitEventPositionsError,
  SplitEventPositionsError,
} from '../actions/event-positions';
export type {
  ConvertWorkflow,
  HorizontalMergeWorkflow,
  HorizontalSplitWorkflow,
  NegRiskWorkflow,
  PrepareConvertRequest,
  PrepareHorizontalMergeRequest,
  PrepareHorizontalSplitRequest,
} from '../actions/neg-risk';
export {
  ConvertError,
  HorizontalMergeError,
  HorizontalSplitError,
  PrepareConvertError,
  PrepareHorizontalMergeError,
  PrepareHorizontalSplitError,
} from '../actions/neg-risk';
export {
  MergePositionsError,
  RedeemPositionsError,
  SplitPositionError,
} from '../actions/positions';
export { TransferErc20Error } from '../actions/transfers';
