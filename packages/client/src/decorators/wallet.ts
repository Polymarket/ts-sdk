import type {
  WalletLeftovers,
  WalletMigration,
  WalletMigrationPreview,
} from '@polymarket/bindings/gamma';
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
import {
  cancelWalletMigration,
  fetchWalletLeftovers,
  fetchWalletMigration,
  type MigrateWalletResult,
  migrateWallet,
  previewWalletMigration,
  sweepWalletLeftovers,
  type WalletMigrationOptions,
} from '../actions/wallet-migration';
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
  /**
   * Fetches the wallet migration of the authenticated account: its state, the
   * Deposit Wallet and the holdings of the current wallet. The read changes
   * nothing.
   *
   * @example
   * ```ts
   * const migration = await client.fetchWalletMigration();
   * ```
   *
   * @throws {@link FetchWalletMigrationError}
   * Thrown on failure.
   * @experimental May change without notice.
   */
  fetchWalletMigration(options?: RequestOptions): Promise<WalletMigration>;
  /**
   * Previews the wallet migration of the authenticated account: what it would
   * move, and each blocker that stops it. The read changes nothing. An
   * account that already trades from its Deposit Wallet is rejected with
   * status `422`.
   *
   * @example
   * ```ts
   * const preview = await client.previewWalletMigration();
   * ```
   *
   * @throws {@link PreviewWalletMigrationError}
   * Thrown on failure.
   * @experimental May change without notice.
   */
  previewWalletMigration(
    options?: RequestOptions,
  ): Promise<WalletMigrationPreview>;
  /**
   * Moves the authenticated account from its Safe or Proxy wallet to its
   * Deposit Wallet, then binds the Deposit Wallet to this client's session.
   *
   * @remarks
   * The migration asks the signer to sign each sweep that moves funds. A
   * restart after a conflict can ask for another signature. A poll while a
   * transaction confirms asks for none. The migration waits while the
   * transactions confirm, and it continues a migration that an earlier call
   * started. A migration that cannot start is rejected with status `422` and
   * a blocker code, such as `SIBLING_FUNDED`. Call
   * {@link SecureWalletActions.previewWalletMigration | previewWalletMigration}
   * first to show the blockers. A failed migration throws
   * `TransactionFailedError`, and a new call starts it again. An account that
   * needs no migration (`NOT_REQUIRED`), such as one that already uses its
   * Deposit Wallet, binds nothing: the result names the current wallet and
   * credentials. A migration that ends in another state throws
   * `UnexpectedResponseError`. A flow that keeps restarting or asking for
   * signatures throws `UnexpectedResponseError`, and a flow that reaches the
   * poll limit throws `TimeoutError`. Pass `signal` to abort the flow,
   * including the wait before a poll.
   *
   * This client stays open: `account` switches to the Deposit Wallet, and
   * `onCredentialsChanged` receives the new access token. A bind from another
   * wallet ends the open user subscriptions with `TransportError`, so
   * subscribe again for the events of the Deposit Wallet. The Deposit Wallet
   * needs trading approvals before it trades: call `setupTradingApprovals`.
   * If the bind fails after the
   * migration completes, `migrateWallet` rejects, and a new call binds the
   * Deposit Wallet while the session is usable. A bind that times out can
   * still apply on the server, and the session then follows the Deposit
   * Wallet.
   *
   * @example
   * ```ts
   * const { credentials } = await client.migrateWallet();
   * await saveCredentials(credentials);
   * await client.setupTradingApprovals();
   * ```
   *
   * @throws {@link MigrateWalletError}
   * Thrown on failure.
   * @experimental May change without notice.
   */
  migrateWallet(options?: WalletMigrationOptions): Promise<MigrateWalletResult>;
  /**
   * Cancels the wallet migration of the authenticated account before funds
   * move. The account keeps its current wallet and can migrate later. A
   * migration whose transaction is in flight, or whose funds reached the
   * Deposit Wallet, is rejected with status `409`. A deployment that keeps
   * the cancel off rejects it with status `503`.
   *
   * @example
   * ```ts
   * const migration = await client.cancelWalletMigration();
   * ```
   *
   * @throws {@link CancelWalletMigrationError}
   * Thrown on failure.
   * @experimental May change without notice.
   */
  cancelWalletMigration(
    options?: WalletMigrationOptions,
  ): Promise<WalletMigration>;
  /**
   * Fetches what the old wallet of a migrated account still holds, its value,
   * the blockers of a leftover sweep and the state of the last sweep. The
   * read changes nothing. An account whose wallet is no longer the Deposit
   * Wallet of its migration is rejected with status `409`.
   *
   * @example
   * ```ts
   * const leftovers = await client.fetchWalletLeftovers();
   * ```
   *
   * @throws {@link FetchWalletLeftoversError}
   * Thrown on failure.
   * @experimental May change without notice.
   */
  fetchWalletLeftovers(options?: RequestOptions): Promise<WalletLeftovers>;
  /**
   * Moves what the old wallet of a migrated account still holds to the
   * Deposit Wallet, and returns the leftovers after the sweep. Check
   * `hasLeftovers` and `lastSweep` in the result to see the outcome.
   *
   * @remarks
   * The sweep asks the signer to sign it when funds must move, and it waits
   * while the transaction confirms. A restart after a conflict can ask for
   * another signature. It does not change the session. An account without a
   * completed migration is rejected with status `409`, a blocked sweep with
   * status `422`, and a deployment that keeps the sweep off rejects it with
   * status `503`. Pass `signal` to abort the sweep, including the wait before
   * a poll.
   *
   * @example
   * ```ts
   * const leftovers = await client.sweepWalletLeftovers();
   * ```
   *
   * @throws {@link SweepWalletLeftoversError}
   * Thrown on failure.
   * @experimental May change without notice.
   */
  sweepWalletLeftovers(
    options?: WalletMigrationOptions,
  ): Promise<WalletLeftovers>;
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
    planCollateralReturn: planCollateralReturn.bind(null, client),
    executeCollateralReturnPlan: executeCollateralReturnPlan.bind(null, client),
    fetchWalletMigration: fetchWalletMigration.bind(null, client),
    previewWalletMigration: previewWalletMigration.bind(null, client),
    migrateWallet: migrateWallet.bind(null, client),
    cancelWalletMigration: cancelWalletMigration.bind(null, client),
    fetchWalletLeftovers: fetchWalletLeftovers.bind(null, client),
    sweepWalletLeftovers: sweepWalletLeftovers.bind(null, client),
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
// Public wallet-migration types surfaced alongside the bound methods.
export type {
  MigrateWalletResult,
  WalletMigrationOptions,
} from '../actions/wallet-migration';
export {
  CancelWalletMigrationError,
  FetchWalletLeftoversError,
  FetchWalletMigrationError,
  MigrateWalletError,
  PreviewWalletMigrationError,
  SweepWalletLeftoversError,
} from '../actions/wallet-migration';
