import type {
  CurrentReward,
  MarketReward,
  OrdersScoringResponse,
  RebatedFee,
  RewardMarket,
  RewardsPercentages,
  TotalUserEarning,
  UserEarning,
  UserRewardsEarning,
} from '@polymarket/bindings/clob';
import type { Prettify } from '@polymarket/types';
import {
  type FetchCurrentRebatesRequest,
  type FetchOrderScoringRequest,
  type FetchOrdersScoringRequest,
  type FetchTotalEarningsForUserForDayRequest,
  fetchCurrentRebates,
  fetchOrderScoring,
  fetchOrdersScoring,
  fetchRewardPercentages,
  fetchTotalEarningsForUserForDay,
  type ListCurrentRewardsRequest,
  type ListMarketRewardsRequest,
  type ListRewardMarketsRequest,
  type ListUserEarningsAndMarketsConfigRequest,
  type ListUserEarningsForDayRequest,
  listCurrentRewards,
  listMarketRewards,
  listRewardMarkets,
  listUserEarningsAndMarketsConfig,
  listUserEarningsForDay,
} from '../actions';
import type {
  BaseClient,
  BasePublicClient,
  BaseSecureClient,
} from '../clients';
import type { Paginated } from '../pagination';
import type { RequestOptions } from '../request-options';

export type PublicRewardsActions = {
  /**
   * Fetches maker fee rebates for a calendar day as a direct collection.
   * Amounts are decimal strings in USDC units. No authentication is required.
   * Returns an empty array when the maker has no rebates for the date.
   * @throws {@link FetchCurrentRebatesError} Thrown on failure.
   * @example
   * ```ts
   * const rebates = await client.fetchCurrentRebates({ date: '2026-10-06', makerAddress });
   * ```
   */
  fetchCurrentRebates(
    request: FetchCurrentRebatesRequest,
    options?: RequestOptions,
  ): Promise<RebatedFee[]>;

  /**
   * Lists active markets with reward configurations and discovery metadata.
   * Configurations may be empty. Positive ranges are min-exclusive and max-inclusive; zero disables a bound.
   * Pages default to 100 items (maximum 500). With orderBy, sortDirection defaults to ASC; otherwise order is unspecified.
   * @throws {@link ListRewardMarketsError} Thrown on failure.
   * @example
   * ```ts
   * for await (const page of client.listRewardMarkets({ query: 'sports' })) {
   *   console.log(page.items);
   * }
   * ```
   */
  listRewardMarkets(
    request?: ListRewardMarketsRequest,
    options?: RequestOptions,
  ): Paginated<RewardMarket[]>;

  /**
   * Lists current active market rewards.
   *
   * @throws {@link ListCurrentRewardsError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listCurrentRewards();
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: CurrentReward[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listCurrentRewards();
   *
   * for await (const page of paginator) {
   *   // page.items: CurrentReward[]
   * }
   * ```
   */
  listCurrentRewards(
    request?: ListCurrentRewardsRequest,
    options?: RequestOptions,
  ): Paginated<CurrentReward[]>;
  /**
   * Lists reward configurations for a market.
   *
   * @throws {@link ListMarketRewardsError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listMarketRewards({
   *   conditionId:
   *     '0xbd31dc8a20211944f6b70f31557f1001557b59905b7738480ca09bd4532f84af',
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: MarketReward[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listMarketRewards({
   *   conditionId:
   *     '0xbd31dc8a20211944f6b70f31557f1001557b59905b7738480ca09bd4532f84af',
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: MarketReward[]
   * }
   * ```
   */
  listMarketRewards(
    request: ListMarketRewardsRequest,
    options?: RequestOptions,
  ): Paginated<MarketReward[]>;
};

export type SecureRewardsActions = Prettify<
  PublicRewardsActions & {
    /**
     * Fetches whether a single order is currently scoring.
     *
     * @throws {@link FetchOrderScoringError}
     * Thrown on failure.
     *
     * @example
     * ```ts
     * const scoring = await client.fetchOrderScoring({
     *   orderId: '123',
     * });
     * ```
     */
    fetchOrderScoring(
      request: FetchOrderScoringRequest,
      options?: RequestOptions,
    ): Promise<boolean>;
    /**
     * Fetches scoring state for multiple orders.
     *
     * @throws {@link FetchOrdersScoringError}
     * Thrown on failure.
     *
     * @example
     * ```ts
     * const scoring = await client.fetchOrdersScoring({
     *   orderIds: ['1', '2'],
     * });
     * ```
     */
    fetchOrdersScoring(
      request: FetchOrdersScoringRequest,
      options?: RequestOptions,
    ): Promise<OrdersScoringResponse>;
    /**
     * Lists per-market earnings for the authenticated account on a given day.
     *
     * @throws {@link ListUserEarningsForDayError}
     * Thrown on failure.
     *
     * @example
     * Fetch the first page of results:
     * ```ts
     * const paginator = client.listUserEarningsForDay({
     *   date: '2026-04-16',
     * });
     *
     * const firstPage = await paginator.firstPage();
     *
     * // Optionally, fetch additional pages:
     * for await (const page of paginator.from(firstPage.nextCursor)) {
     *   // page.items: UserEarning[]
     * }
     * ```
     *
     * @example
     * Loop through all pages with `for await`:
     * ```ts
     * const paginator = client.listUserEarningsForDay({
     *   date: '2026-04-16',
     * });
     *
     * for await (const page of paginator) {
     *   // page.items: UserEarning[]
     * }
     * ```
     */
    listUserEarningsForDay(
      request: ListUserEarningsForDayRequest,
      options?: RequestOptions,
    ): Paginated<UserEarning[]>;
    /**
     * Fetches total earnings for the authenticated account on a given day.
     * Set `sponsored: true` to include sponsored rewards and the native/sponsored
     * breakdown. Omitted or false returns native rewards only; absent breakdown
     * fields remain undefined.
     *
     * @throws {@link FetchTotalEarningsForUserForDayError}
     * Thrown on failure.
     *
     * @example
     * ```ts
     * const earnings = await client.fetchTotalEarningsForUserForDay({
     *   date: '2026-04-16',
     * });
     * ```
     */
    fetchTotalEarningsForUserForDay(
      request: FetchTotalEarningsForUserForDayRequest,
      options?: RequestOptions,
    ): Promise<TotalUserEarning[]>;
    /**
     * Lists market reward configuration and earnings for the authenticated account on a given day.
     *
     * @throws {@link ListUserEarningsAndMarketsConfigError}
     * Thrown on failure.
     *
     * @example
     * Fetch the first page of results:
     * ```ts
     * const paginator = client.listUserEarningsAndMarketsConfig({
     *   date: '2026-04-16',
     * });
     *
     * const firstPage = await paginator.firstPage();
     *
     * // Optionally, fetch additional pages:
     * for await (const page of paginator.from(firstPage.nextCursor)) {
     *   // page.items: UserRewardsEarning[]
     * }
     * ```
     *
     * @example
     * Loop through all pages with `for await`:
     * ```ts
     * const paginator = client.listUserEarningsAndMarketsConfig({
     *   date: '2026-04-16',
     * });
     *
     * for await (const page of paginator) {
     *   // page.items: UserRewardsEarning[]
     * }
     * ```
     */
    listUserEarningsAndMarketsConfig(
      request: ListUserEarningsAndMarketsConfigRequest,
      options?: RequestOptions,
    ): Paginated<UserRewardsEarning[]>;
    /**
     * Fetches reward percentages for the authenticated account.
     *
     * @throws {@link FetchRewardPercentagesError}
     * Thrown on failure.
     *
     * @example
     * ```ts
     * const percentages = await client.fetchRewardPercentages();
     * ```
     */
    fetchRewardPercentages(
      options?: RequestOptions,
    ): Promise<RewardsPercentages>;
  }
>;

function publicRewardsActions(client: BaseClient): PublicRewardsActions {
  return {
    fetchCurrentRebates: fetchCurrentRebates.bind(null, client),
    listRewardMarkets: listRewardMarkets.bind(null, client),
    listCurrentRewards: listCurrentRewards.bind(null, client),
    listMarketRewards: listMarketRewards.bind(null, client),
  };
}

export function rewardsActions(client: BasePublicClient): PublicRewardsActions;
export function rewardsActions(client: BaseSecureClient): SecureRewardsActions;
export function rewardsActions(
  client: BaseClient,
): PublicRewardsActions | SecureRewardsActions {
  const actions = publicRewardsActions(client);

  if (client.isPublicClient()) {
    return actions;
  }

  return {
    ...actions,
    fetchOrderScoring: fetchOrderScoring.bind(null, client),
    fetchOrdersScoring: fetchOrdersScoring.bind(null, client),
    listUserEarningsForDay: listUserEarningsForDay.bind(null, client),
    fetchTotalEarningsForUserForDay: fetchTotalEarningsForUserForDay.bind(
      null,
      client,
    ),
    listUserEarningsAndMarketsConfig: listUserEarningsAndMarketsConfig.bind(
      null,
      client,
    ),
    fetchRewardPercentages: fetchRewardPercentages.bind(null, client),
  };
}

// Error unions and runtime `isError` guards for every action bound above.
// Surfaced at the root entry point through `export * from './decorators'`.
// Keep this list in sync with the methods on PublicRewardsActions / SecureRewardsActions.
export {
  FetchCurrentRebatesError,
  type FetchCurrentRebatesRequest,
  FetchOrderScoringError,
  FetchOrdersScoringError,
  FetchRewardPercentagesError,
  FetchTotalEarningsForUserForDayError,
  ListCurrentRewardsError,
  ListMarketRewardsError,
  ListRewardMarketsError,
  type ListRewardMarketsRequest,
  ListUserEarningsAndMarketsConfigError,
  ListUserEarningsForDayError,
} from '../actions';
