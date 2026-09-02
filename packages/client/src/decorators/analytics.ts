import type { BuilderTrade } from '@polymarket/bindings/clob';
import type {
  BuilderStanding,
  BuilderVolumePoint,
  TraderLeaderboardEntry,
} from '@polymarket/bindings/data';
import {
  type FetchBuilderVolumeRequest,
  fetchBuilderVolume,
  type ListBuilderLeaderboardRequest,
  type ListBuilderTradesRequest,
  type ListTraderLeaderboardRequest,
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
   * @throws {@link ListTraderLeaderboardError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listTraderLeaderboard({
   *   orderBy: 'PNL',
   *   pageSize: 10,
   *   timePeriod: 'DAY',
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
   *   orderBy: 'PNL',
   *   pageSize: 10,
   *   timePeriod: 'DAY',
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
};

export function analyticsActions(client: BasePublicClient): AnalyticsActions;
export function analyticsActions(client: BaseSecureClient): AnalyticsActions;
export function analyticsActions(client: BaseClient): AnalyticsActions {
  return {
    listBuilderTrades: listBuilderTrades.bind(null, client),
    listBuilderLeaderboard: listBuilderLeaderboard.bind(null, client),
    fetchBuilderVolume: fetchBuilderVolume.bind(null, client),
    listTraderLeaderboard: listTraderLeaderboard.bind(null, client),
  };
}

// Error unions and runtime `isError` guards for every action bound above.
// Surfaced at the root entry point through `export * from './decorators'`.
// Keep this list in sync with the methods on AnalyticsActions.
export {
  BuilderVolumeInterval,
  FetchBuilderVolumeError,
  LeaderboardWindow,
  ListBuilderLeaderboardError,
  ListBuilderTradesError,
  ListTraderLeaderboardError,
} from '../actions';
