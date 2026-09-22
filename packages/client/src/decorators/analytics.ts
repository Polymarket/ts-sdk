import type { BuilderTrade } from '@polymarket/bindings/clob';
import type {
  BiggestWinner,
  BuilderStanding,
  BuilderVolumePoint,
  TraderLeaderboardEntry,
} from '@polymarket/bindings/data';
import {
  type FetchBuilderVolumeRequest,
  fetchBuilderVolume,
  type ListBiggestWinnersRequest,
  type ListBuilderLeaderboardRequest,
  type ListBuilderTradesRequest,
  type ListTraderLeaderboardRequest,
  listBiggestWinners,
  listBuilderLeaderboard,
  listBuilderTrades,
  listTraderLeaderboard,
} from '../actions';
import type {
  BaseClient,
  BasePublicClient,
  BaseSecureClient,
} from '../clients';
import type { Paginated } from '../pagination';

export type AnalyticsActions = {
  /**
   * Lists builder-attributed trades.
   *
   * @throws {@link ListBuilderTradesError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listBuilderTrades({
   *   builderCode: '0x...',
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: BuilderTrade[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listBuilderTrades({
   *   builderCode: '0x...',
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: BuilderTrade[]
   * }
   * ```
   */
  listBuilderTrades(
    request: ListBuilderTradesRequest,
  ): Paginated<BuilderTrade[]>;

  /**
   * Lists builder leaderboard rankings.
   *
   * Builders are ranked by attributed share volume within `window`, which
   * defaults to one day. `builderCode` is the stable identifier; names and
   * profile images are display metadata. `pageSize` defaults to 100 (max 1000).
   * Transient rate limits are retried automatically.
   *
   * @throws {@link ListBuilderLeaderboardError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listBuilderLeaderboard({
   *   pageSize: 10,
   *   window: LeaderboardWindow.Day,
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: BuilderStanding[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listBuilderLeaderboard({
   *   pageSize: 10,
   *   window: LeaderboardWindow.Day,
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: BuilderStanding[]
   * }
   * ```
   */
  listBuilderLeaderboard(
    request?: ListBuilderLeaderboardRequest,
  ): Paginated<BuilderStanding[]>;

  /**
   * Fetches the per-builder volume time series.
   *
   * `interval` controls bucket width and defaults to daily; use
   * {@link BuilderVolumeInterval.Year} for one bucket per calendar year.
   * `bucketLimit` returns that many complete recent buckets (default 30, max 90),
   * not that many builder rows. Results are newest bucket first, and volume is
   * measured in shares. Transient rate limits are retried automatically.
   *
   * @throws {@link FetchBuilderVolumeError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const volume = await client.fetchBuilderVolume({
   *   interval: BuilderVolumeInterval.Day,
   *   bucketLimit: 7,
   * });
   * ```
   */
  fetchBuilderVolume(
    request?: FetchBuilderVolumeRequest,
  ): Promise<BuilderVolumePoint[]>;

  /**
   * Lists trader leaderboard rankings.
   *
   * `window` defaults to one day, `category` to overall, and `sortBy` to PnL.
   * Finite-window PnL is marked equity change net of flows, while all-time PnL
   * is realized only. Volume is measured in shares. Tied traders share a rank
   * and the next rank skips. `pageSize` defaults to 100 (max 1000).
   *
   * @throws {@link ListTraderLeaderboardError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listTraderLeaderboard({
   *   pageSize: 10,
   *   sortBy: TraderLeaderboardSort.Pnl,
   *   window: LeaderboardWindow.Week,
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: TraderLeaderboardEntry[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listTraderLeaderboard({
   *   pageSize: 10,
   *   sortBy: TraderLeaderboardSort.Pnl,
   *   window: LeaderboardWindow.Week,
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: TraderLeaderboardEntry[]
   * }
   * ```
   */
  listTraderLeaderboard(
    request?: ListTraderLeaderboardRequest,
  ): Paginated<TraderLeaderboardEntry[]>;

  /**
   * Lists the largest individual winning positions.
   *
   * The board has one row per position, ranked by its resolution profit.
   * `window` applies to resolution time and defaults to one day; `category`
   * defaults to overall. Equal profits retain distinct row ordinals. Combo rows
   * have no parent event, so branch on `kind` before using event metadata.
   * `pageSize` defaults to 100 (max 1000).
   *
   * @throws {@link ListBiggestWinnersError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const paginator = client.listBiggestWinners({
   *   category: 'sports',
   *   pageSize: 10,
   *   window: LeaderboardWindow.Week,
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: BiggestWinner[]
   * }
   * ```
   */
  listBiggestWinners(
    request?: ListBiggestWinnersRequest,
  ): Paginated<BiggestWinner[]>;
};

export function analyticsActions(client: BasePublicClient): AnalyticsActions;
export function analyticsActions(client: BaseSecureClient): AnalyticsActions;
export function analyticsActions(client: BaseClient): AnalyticsActions {
  return {
    listBuilderTrades: listBuilderTrades.bind(null, client),
    listBuilderLeaderboard: listBuilderLeaderboard.bind(null, client),
    fetchBuilderVolume: fetchBuilderVolume.bind(null, client),
    listTraderLeaderboard: listTraderLeaderboard.bind(null, client),
    listBiggestWinners: listBiggestWinners.bind(null, client),
  };
}

// Error unions and runtime `isError` guards for every action bound above.
// Surfaced at the root entry point through `export * from './decorators'`.
// Keep this list in sync with the methods on AnalyticsActions.
export {
  BiggestWinnerKind,
  BuilderVolumeInterval,
  FetchBuilderVolumeError,
  LeaderboardWindow,
  ListBiggestWinnersError,
  ListBuilderLeaderboardError,
  ListBuilderTradesError,
  ListTraderLeaderboardError,
  TraderLeaderboardSort,
} from '../actions';
