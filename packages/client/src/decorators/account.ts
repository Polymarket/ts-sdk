import type {
  ClobTrade,
  NotificationsResponse,
} from '@polymarket/bindings/clob';
import type {
  Activity,
  ComboActivity,
  ComboPosition,
  PortfolioValue,
  Position,
  UserPnlSeries,
  UserStats,
  UserVolume,
} from '@polymarket/bindings/data';
import type { Prettify } from '@polymarket/types';
import {
  type DownloadAccountingSnapshotRequest,
  type DropNotificationsRequest,
  downloadAccountingSnapshot,
  dropNotifications,
  type FetchPortfolioValueRequest,
  type FetchUserPnlRequest,
  type FetchUserStatsRequest,
  type FetchUserVolumeRequest,
  fetchClosedOnlyMode,
  fetchNotifications,
  fetchPortfolioValue,
  fetchUserPnl,
  fetchUserStats,
  fetchUserVolume,
  type ListAccountTradesRequest,
  type ListActivityRequest,
  type ListComboActivityRequest,
  type ListComboPositionsRequest,
  type ListPositionsRequest,
  listAccountTrades,
  listActivity,
  listComboActivity,
  listComboPositions,
  listPositions,
} from '../actions';
import type {
  BaseClient,
  BasePublicClient,
  BaseSecureClient,
} from '../clients';
import type { Paginated } from '../pagination';

type DefaultAccountWallet<TRequest extends { user?: string }> = Prettify<
  Omit<TRequest, 'user'> & {
    /**
     * Wallet address to use.
     *
     * @defaultValue `client.account.wallet`
     */
    user?: string;
  }
>;

export type SecureListPositionsRequest =
  DefaultAccountWallet<ListPositionsRequest>;
export type SecureListComboPositionsRequest =
  DefaultAccountWallet<ListComboPositionsRequest>;
export type SecureFetchPortfolioValueRequest =
  DefaultAccountWallet<FetchPortfolioValueRequest>;
export type SecureFetchUserPnlRequest =
  DefaultAccountWallet<FetchUserPnlRequest>;
export type SecureFetchUserStatsRequest =
  DefaultAccountWallet<FetchUserStatsRequest>;
export type SecureFetchUserVolumeRequest =
  DefaultAccountWallet<FetchUserVolumeRequest>;
export type SecureDownloadAccountingSnapshotRequest =
  DefaultAccountWallet<DownloadAccountingSnapshotRequest>;
export type SecureListActivityRequest =
  DefaultAccountWallet<ListActivityRequest>;
export type SecureListComboActivityRequest =
  DefaultAccountWallet<ListComboActivityRequest>;

export type PublicAccountActions = Prettify<{
  /**
   * Lists current positions for a wallet.
   *
   * @throws {@link ListPositionsError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listPositions({
   *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
   *   pageSize: 10,
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: Position[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listPositions({
   *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
   *   pageSize: 10,
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: Position[]
   * }
   * ```
   */
  listPositions(request: ListPositionsRequest): Paginated<Position[]>;
  /**
   * Lists combo positions for a wallet.
   *
   * @throws {@link ListComboPositionsError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listComboPositions({
   *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
   *   pageSize: 10,
   * });
   *
   * const firstPage = await paginator.firstPage();
   * ```
   *
   * @example
   * Filter to any of several resolved statuses:
   * ```ts
   * const paginator = client.listComboPositions({
   *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
   *   status: [
   *     ComboPositionStatus.ResolvedWin,
   *     ComboPositionStatus.ResolvedPartial,
   *     ComboPositionStatus.ResolvedLoss,
   *   ],
   * });
   * ```
   */
  listComboPositions(
    request: ListComboPositionsRequest,
  ): Paginated<ComboPosition[]>;
  /**
   * Fetches the total value for a wallet's positions.
   *
   * When `conditionId` is present, only those single-market positions are
   * included; portfolio-level combo positions are excluded. Accepts at most
   * 20 distinct condition ids.
   *
   * @throws {@link FetchPortfolioValueError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const value = await client.fetchPortfolioValue({
   *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
   * });
   * ```
   */
  fetchPortfolioValue(
    request: FetchPortfolioValueRequest,
  ): Promise<PortfolioValue>;
  /**
   * Fetches profile and lifetime trading statistics for a wallet.
   *
   * Returns `null` when the wallet is not a known user.
   *
   * @throws {@link FetchUserStatsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const stats = await client.fetchUserStats({
   *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
   * });
   * ```
   */
  fetchUserStats(request: FetchUserStatsRequest): Promise<UserStats | null>;
  /**
   * Fetches a wallet's cumulative PnL series.
   *
   * `interval` defaults to one day and `fidelity` defaults to one hour. Each
   * point is cumulative through its timestamp; nullable amounts mean the
   * source was unavailable and are never coerced to zero.
   *
   * @throws {@link FetchUserPnlError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const pnl = await client.fetchUserPnl({
   *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
   *   interval: UserPnlInterval.OneWeek,
   *   fidelity: UserPnlFidelity.ThreeHours,
   * });
   * ```
   */
  fetchUserPnl(request: FetchUserPnlRequest): Promise<UserPnlSeries>;
  /**
   * Fetches a wallet's trading volume for a time window.
   *
   * Volume is returned in shares and USD. Window bounds accept epoch seconds
   * or `Date` values and are widened to whole UTC days.
   *
   * @throws {@link FetchUserVolumeError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const volume = await client.fetchUserVolume({
   *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
   *   window: { start: new Date('2026-08-01T00:00:00Z') },
   * });
   * ```
   */
  fetchUserVolume(request: FetchUserVolumeRequest): Promise<UserVolume>;
  /**
   * Downloads an accounting snapshot archive for a wallet.
   *
   * @throws {@link DownloadAccountingSnapshotError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const snapshot = await client.downloadAccountingSnapshot({
   *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
   * });
   * ```
   */
  downloadAccountingSnapshot(
    request: DownloadAccountingSnapshotRequest,
  ): Promise<Blob>;
  /**
   * Lists wallet activity.
   *
   * Every activity type the service serves is included by default — deposits and withdrawals are not filtered out; use the `type` filter to narrow results.
   *
   * @throws {@link ListActivityError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listActivity({
   *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
   *   pageSize: 10,
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: Activity[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listActivity({
   *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
   *   pageSize: 10,
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: Activity[]
   * }
   * ```
   */
  listActivity(request: ListActivityRequest): Paginated<Activity[]>;
  /**
   * Lists combo lifecycle activity for a wallet.
   *
   * @throws {@link ListComboActivityError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listComboActivity({
   *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
   *   pageSize: 10,
   * });
   *
   * const firstPage = await paginator.firstPage();
   * ```
   */
  listComboActivity(
    request: ListComboActivityRequest,
  ): Paginated<ComboActivity[]>;
}>;

export type SecureAccountActions = Prettify<{
  /**
   * Lists current positions for a wallet.
   *
   * Defaults to the authenticated account's wallet when `user` is omitted.
   * To list a market's holders (a `conditionId` anchor with no wallet), use
   * a public client's `listPositions` instead.
   *
   * @throws {@link ListPositionsError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results for the authenticated account:
   * ```ts
   * const paginator = client.listPositions({
   *   pageSize: 10,
   * });
   *
   * const firstPage = await paginator.firstPage();
   * ```
   */
  listPositions(request?: SecureListPositionsRequest): Paginated<Position[]>;
  /**
   * Lists combo positions for a wallet.
   *
   * Defaults to the authenticated account's wallet when `user` is omitted.
   *
   * @throws {@link ListComboPositionsError}
   * Thrown on failure.
   *
   * @example
   * Filter the authenticated account's positions to multiple statuses:
   * ```ts
   * const paginator = client.listComboPositions({
   *   status: [
   *     ComboPositionStatus.ResolvedWin,
   *     ComboPositionStatus.ResolvedPartial,
   *   ],
   * });
   * ```
   */
  listComboPositions(
    request?: SecureListComboPositionsRequest,
  ): Paginated<ComboPosition[]>;
  /**
   * Fetches the total value for a wallet's positions.
   *
   * When `conditionId` is present, only those single-market positions are
   * included; portfolio-level combo positions are excluded. Accepts at most
   * 20 distinct condition ids.
   *
   * Defaults to the authenticated account's wallet when `user` is omitted.
   *
   * @throws {@link FetchPortfolioValueError}
   * Thrown on failure.
   */
  fetchPortfolioValue(
    request?: SecureFetchPortfolioValueRequest,
  ): Promise<PortfolioValue>;
  /**
   * Fetches profile and lifetime trading statistics for a wallet.
   *
   * Defaults to the authenticated account's wallet when `user` is omitted.
   * Returns `null` when the wallet is not a known user.
   *
   * @throws {@link FetchUserStatsError}
   * Thrown on failure.
   */
  fetchUserStats(
    request?: SecureFetchUserStatsRequest,
  ): Promise<UserStats | null>;
  /**
   * Fetches the cumulative PnL series for a wallet.
   *
   * Defaults to the authenticated account's wallet when `user` is omitted.
   * `interval` defaults to one day and `fidelity` defaults to one hour.
   *
   * @throws {@link FetchUserPnlError}
   * Thrown on failure.
   */
  fetchUserPnl(request?: SecureFetchUserPnlRequest): Promise<UserPnlSeries>;
  /**
   * Fetches trading volume for a wallet over a time window.
   *
   * Defaults to the authenticated account's wallet when `user` is omitted.
   * Window bounds accept epoch seconds or `Date` values and are widened to
   * whole UTC days.
   *
   * @throws {@link FetchUserVolumeError}
   * Thrown on failure.
   */
  fetchUserVolume(request?: SecureFetchUserVolumeRequest): Promise<UserVolume>;
  /**
   * Downloads an accounting snapshot archive for a wallet.
   *
   * Defaults to the authenticated account's wallet when `user` is omitted.
   *
   * @throws {@link DownloadAccountingSnapshotError}
   * Thrown on failure.
   */
  downloadAccountingSnapshot(
    request?: SecureDownloadAccountingSnapshotRequest,
  ): Promise<Blob>;
  /**
   * Lists wallet activity.
   *
   * Defaults to the authenticated account's wallet when `user` is omitted.
   *
   * Every activity type the service serves is included by default — deposits and withdrawals are not filtered out; use the `type` filter to narrow results.
   *
   * @throws {@link ListActivityError}
   * Thrown on failure.
   */
  listActivity(request?: SecureListActivityRequest): Paginated<Activity[]>;
  /**
   * Lists combo lifecycle activity for a wallet.
   *
   * Defaults to the authenticated account's wallet when `user` is omitted.
   *
   * @throws {@link ListComboActivityError}
   * Thrown on failure.
   */
  listComboActivity(
    request?: SecureListComboActivityRequest,
  ): Paginated<ComboActivity[]>;
  /**
   * Lists trades for the authenticated account across all pages.
   *
   * @throws {@link ListAccountTradesError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listAccountTrades({
   *   market: '0x0000000000000000000000000000000000000000000000000000000000000001',
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: ClobTrade[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listAccountTrades({
   *   market: '0x0000000000000000000000000000000000000000000000000000000000000001',
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: ClobTrade[]
   * }
   * ```
   */
  listAccountTrades(request?: ListAccountTradesRequest): Paginated<ClobTrade[]>;
  /**
   * Fetches notifications for the authenticated account.
   * Notifications of a kind this SDK version does not recognize are omitted.
   *
   * @throws {@link FetchNotificationsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const notifications = await client.fetchNotifications();
   * ```
   */
  fetchNotifications(): Promise<NotificationsResponse>;
  /**
   * Drops notifications for the authenticated account.
   *
   * @throws {@link DropNotificationsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * await client.dropNotifications({
   *   ids: ['1', '2'],
   * });
   * ```
   */
  dropNotifications(request: DropNotificationsRequest): Promise<void>;
  /**
   * Fetches whether the account is restricted to closed-only trading.
   *
   * @throws {@link FetchClosedOnlyModeError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const closedOnly = await client.fetchClosedOnlyMode();
   * ```
   */
  fetchClosedOnlyMode(): Promise<boolean>;
}>;

function publicAccountActions(client: BaseClient): PublicAccountActions {
  return {
    listPositions: listPositions.bind(null, client),
    listComboPositions: listComboPositions.bind(null, client),
    fetchPortfolioValue: fetchPortfolioValue.bind(null, client),
    fetchUserStats: fetchUserStats.bind(null, client),
    fetchUserPnl: fetchUserPnl.bind(null, client),
    fetchUserVolume: fetchUserVolume.bind(null, client),
    downloadAccountingSnapshot: downloadAccountingSnapshot.bind(null, client),
    listActivity: listActivity.bind(null, client),
    listComboActivity: listComboActivity.bind(null, client),
  };
}

function withAccountWallet<TRequest extends { user?: string }>(
  client: BaseSecureClient,
  request: TRequest = {} as TRequest,
): Omit<TRequest, 'user'> & { user: string } {
  return {
    ...request,
    user: request.user ?? client.account.wallet,
  };
}

export function accountActions(client: BasePublicClient): PublicAccountActions;
export function accountActions(client: BaseSecureClient): SecureAccountActions;
export function accountActions(
  client: BaseClient,
): PublicAccountActions | SecureAccountActions {
  const actions = publicAccountActions(client);

  if (client.isPublicClient()) {
    return actions;
  }

  return {
    ...actions,
    listPositions: (request?: SecureListPositionsRequest) =>
      listPositions(client, withAccountWallet(client, request)),
    listComboPositions: (request?: SecureListComboPositionsRequest) =>
      listComboPositions(client, withAccountWallet(client, request)),
    fetchPortfolioValue: (request?: SecureFetchPortfolioValueRequest) =>
      fetchPortfolioValue(client, withAccountWallet(client, request)),
    fetchUserStats: (request?: SecureFetchUserStatsRequest) =>
      fetchUserStats(client, withAccountWallet(client, request)),
    fetchUserPnl: (request?: SecureFetchUserPnlRequest) =>
      fetchUserPnl(client, withAccountWallet(client, request)),
    fetchUserVolume: (request?: SecureFetchUserVolumeRequest) =>
      fetchUserVolume(client, withAccountWallet(client, request)),
    downloadAccountingSnapshot: (
      request?: SecureDownloadAccountingSnapshotRequest,
    ) => downloadAccountingSnapshot(client, withAccountWallet(client, request)),
    listActivity: (request?: SecureListActivityRequest) =>
      listActivity(client, withAccountWallet(client, request)),
    listComboActivity: (request?: SecureListComboActivityRequest) =>
      listComboActivity(client, withAccountWallet(client, request)),
    listAccountTrades: listAccountTrades.bind(null, client),
    fetchNotifications: fetchNotifications.bind(null, client),
    dropNotifications: dropNotifications.bind(null, client),
    fetchClosedOnlyMode: fetchClosedOnlyMode.bind(null, client),
  };
}

// Error unions and runtime `isError` guards for every action bound above.
// Surfaced at the root entry point through `export * from './decorators'`.
// Keep this list in sync with the methods on PublicAccountActions / SecureAccountActions.
export {
  DownloadAccountingSnapshotError,
  DropNotificationsError,
  FetchClosedOnlyModeError,
  FetchNotificationsError,
  FetchPortfolioValueError,
  FetchUserPnlError,
  FetchUserStatsError,
  FetchUserVolumeError,
  ListAccountTradesError,
  ListActivityError,
  ListComboActivityError,
  ListComboPositionsError,
  ListPositionsError,
} from '../actions';
export {
  ComboActivityType,
  SortDirection,
  TipSide,
  TradeFilterType,
} from '../actions/activity';
export type { ComboPositionStatusFilter } from '../actions/portfolio';
export {
  ComboPositionSortBy,
  ComboPositionStatus,
  PositionFilterType,
  PositionSortBy,
  PositionStatus,
  UserPnlFidelity,
  UserPnlInterval,
} from '../actions/portfolio';
