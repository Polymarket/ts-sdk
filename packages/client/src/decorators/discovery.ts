import type {
  Comment,
  Event,
  Market,
  PublicProfile,
  RelatedTag,
  Series,
  SportsMarketTypesResponse,
  SportsMetadata,
  Tag,
  TagReference,
  Team,
} from '@polymarket/bindings/gamma';
import {
  type FetchCommentsByIdRequest,
  type FetchEventRequest,
  type FetchEventTagsRequest,
  type FetchMarketRequest,
  type FetchMarketTagsRequest,
  type FetchPublicProfileRequest,
  type FetchRelatedTagResourcesRequest,
  type FetchRelatedTagsRequest,
  type FetchSeriesRequest,
  type FetchTagRequest,
  fetchCommentsById,
  fetchEvent,
  fetchEventTags,
  fetchMarket,
  fetchMarketTags,
  fetchPublicProfile,
  fetchRelatedTagResources,
  fetchRelatedTags,
  fetchSeries,
  fetchSportsMarketTypes,
  fetchTag,
  type ListCommentsByUserAddressRequest,
  type ListCommentsRequest,
  type ListEventsRequest,
  type ListMarketsRequest,
  type ListSeriesRequest,
  type ListTagsRequest,
  type ListTeamsRequest,
  listComments,
  listCommentsByUserAddress,
  listEvents,
  listMarkets,
  listSeries,
  listSports,
  listTags,
  listTeams,
  type SearchRequest,
  type SearchResults,
  search,
} from '../actions';
import type {
  BaseClient,
  BasePublicClient,
  BaseSecureClient,
} from '../clients';
import type { Paginated } from '../pagination';

export type DiscoveryActions = {
  /**
   * Lists events.
   *
   * Defaults to open events. Pass `closed: true` to list settled events.
   *
   * @throws {@link ListEventsError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listEvents({
   *   pageSize: 10,
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: Event[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listEvents({
   *   pageSize: 10,
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: Event[]
   * }
   * ```
   */
  listEvents(request?: ListEventsRequest): Paginated<Event[]>;

  /**
   * Fetches an event.
   *
   * @throws {@link FetchEventError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const event = await client.fetchEvent({
   *   id: '123',
   * });
   *
   * const eventBySlug = await client.fetchEvent({
   *   slug: 'presidential-election-2028',
   * });
   *
   * const eventByUrl = await client.fetchEvent({
   *   url: 'https://polymarket.com/event/presidential-election-2028',
   * });
   * ```
   */
  fetchEvent(request: FetchEventRequest): Promise<Event>;

  /**
   * Fetches an event's tags.
   *
   * @throws {@link FetchEventTagsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const tags = await client.fetchEventTags({
   *   id: '123',
   * });
   * ```
   */
  fetchEventTags(request: FetchEventTagsRequest): Promise<TagReference[]>;

  /**
   * Lists markets.
   *
   * @throws {@link ListMarketsError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listMarkets({
   *   closed: false,
   *   pageSize: 10,
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: Market[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listMarkets({
   *   closed: false,
   *   pageSize: 10,
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: Market[]
   * }
   * ```
   */
  listMarkets(request?: ListMarketsRequest): Paginated<Market[]>;

  /**
   * Fetches a market.
   *
   * @throws {@link FetchMarketError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const market = await client.fetchMarket({
   *   id: '12345',
   * });
   *
   * const marketBySlug = await client.fetchMarket({
   *   slug: 'some-market-slug',
   * });
   *
   * const marketByUrl = await client.fetchMarket({
   *   url: 'https://polymarket.com/market/some-market-slug',
   * });
   * ```
   */
  fetchMarket(request: FetchMarketRequest): Promise<Market>;

  /**
   * Fetches a market's tags.
   *
   * @throws {@link FetchMarketTagsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const tags = await client.fetchMarketTags({
   *   id: '12345',
   * });
   * ```
   */
  fetchMarketTags(request: FetchMarketTagsRequest): Promise<TagReference[]>;

  /**
   * Lists series.
   *
   * @throws {@link ListSeriesError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listSeries({
   *   pageSize: 10,
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: Series[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listSeries({
   *   pageSize: 10,
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: Series[]
   * }
   * ```
   */
  listSeries(request?: ListSeriesRequest): Paginated<Series[]>;

  /**
   * Fetches a series.
   *
   * @throws {@link FetchSeriesError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const series = await client.fetchSeries({
   *   id: '123',
   * });
   * ```
   */
  fetchSeries(request: FetchSeriesRequest): Promise<Series>;

  /**
   * Lists tags.
   *
   * @throws {@link ListTagsError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listTags({
   *   pageSize: 10,
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: Tag[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listTags({
   *   pageSize: 10,
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: Tag[]
   * }
   * ```
   */
  listTags(request?: ListTagsRequest): Paginated<Tag[]>;

  /**
   * Fetches a tag by id or slug.
   *
   * @throws {@link FetchTagError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const tag = await client.fetchTag({
   *   slug: 'politics',
   * });
   * ```
   */
  fetchTag(request: FetchTagRequest): Promise<Tag>;

  /**
   * Fetches related tag relationships by id or slug.
   *
   * @throws {@link FetchRelatedTagsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const related = await client.fetchRelatedTags({
   *   slug: 'politics',
   * });
   * ```
   */
  fetchRelatedTags(request: FetchRelatedTagsRequest): Promise<RelatedTag[]>;

  /**
   * Fetches resources linked from related tag relationships by id or slug.
   *
   * @throws {@link FetchRelatedTagResourcesError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const resources = await client.fetchRelatedTagResources({
   *   slug: 'politics',
   * });
   * ```
   */
  fetchRelatedTagResources(
    request: FetchRelatedTagResourcesRequest,
  ): Promise<Tag[]>;

  /**
   * Runs a public full-text search.
   *
   * @throws {@link SearchError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.search({
   *   q: 'election',
   *   pageSize: 10,
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items.events: Event[]
   *   // page.items.tags: SearchTag[]
   *   // page.items.profiles: Profile[]
   * }
   * ```
   */
  search(request: SearchRequest): Paginated<SearchResults>;

  /**
   * Lists available sports metadata.
   *
   * @throws {@link ListSportsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const sports = await client.listSports();
   * ```
   */
  listSports(): Promise<SportsMetadata[]>;

  /**
   * Fetches the available market types grouped by sport.
   *
   * @throws {@link FetchSportsMarketTypesError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const marketTypes = await client.fetchSportsMarketTypes();
   * ```
   */
  fetchSportsMarketTypes(): Promise<SportsMarketTypesResponse>;

  /**
   * Lists teams.
   *
   * @throws {@link ListTeamsError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listTeams({
   *   pageSize: 10,
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: Team[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listTeams({
   *   pageSize: 10,
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: Team[]
   * }
   * ```
   */
  listTeams(request?: ListTeamsRequest): Paginated<Team[]>;

  /**
   * Fetches a public profile by wallet address.
   *
   * @throws {@link FetchPublicProfileError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const profile = await client.fetchPublicProfile({
   *   address: '0x1234...',
   * });
   * ```
   */
  fetchPublicProfile(
    request: FetchPublicProfileRequest,
  ): Promise<PublicProfile | null>;

  /**
   * Lists comments for an event or series.
   *
   * @throws {@link ListCommentsError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listComments({
   *   parentEntityId: '123',
   *   parentEntityType: CommentParentEntityType.Event,
   *   pageSize: 20,
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: Comment[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listComments({
   *   parentEntityId: '123',
   *   parentEntityType: CommentParentEntityType.Event,
   *   pageSize: 20,
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: Comment[]
   * }
   * ```
   */
  listComments(request: ListCommentsRequest): Paginated<Comment[]>;

  /**
   * Fetches a comment thread by comment id.
   *
   * @throws {@link FetchCommentsByIdError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const thread = await client.fetchCommentsById({
   *   id: '456',
   *   getPositions: true,
   * });
   * ```
   */
  fetchCommentsById(request: FetchCommentsByIdRequest): Promise<Comment[]>;

  /**
   * Lists comments written by a wallet address.
   *
   * @throws {@link ListCommentsByUserAddressError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listCommentsByUserAddress({
   *   address: '0x1234...',
   *   pageSize: 10,
   *   order: 'DESC',
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: Comment[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listCommentsByUserAddress({
   *   address: '0x1234...',
   *   pageSize: 10,
   *   order: 'DESC',
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: Comment[]
   * }
   * ```
   */
  listCommentsByUserAddress(
    request: ListCommentsByUserAddressRequest,
  ): Paginated<Comment[]>;
};

export function discoveryActions(client: BasePublicClient): DiscoveryActions;
export function discoveryActions(client: BaseSecureClient): DiscoveryActions;
export function discoveryActions(client: BaseClient): DiscoveryActions {
  return {
    listEvents: listEvents.bind(null, client),
    fetchEvent: fetchEvent.bind(null, client),
    fetchEventTags: fetchEventTags.bind(null, client),
    listMarkets: listMarkets.bind(null, client),
    fetchMarket: fetchMarket.bind(null, client),
    fetchMarketTags: fetchMarketTags.bind(null, client),
    listSeries: listSeries.bind(null, client),
    fetchSeries: fetchSeries.bind(null, client),
    listTags: listTags.bind(null, client),
    fetchTag: fetchTag.bind(null, client),
    fetchRelatedTags: fetchRelatedTags.bind(null, client),
    fetchRelatedTagResources: fetchRelatedTagResources.bind(null, client),
    search: search.bind(null, client),
    listSports: listSports.bind(null, client),
    fetchSportsMarketTypes: fetchSportsMarketTypes.bind(null, client),
    listTeams: listTeams.bind(null, client),
    fetchPublicProfile: fetchPublicProfile.bind(null, client),
    listComments: listComments.bind(null, client),
    fetchCommentsById: fetchCommentsById.bind(null, client),
    listCommentsByUserAddress: listCommentsByUserAddress.bind(null, client),
  };
}

// Error unions and runtime `isError` guards for every action bound above.
// Surfaced at the root entry point through `export * from './decorators'`.
// Keep this list in sync with the methods on DiscoveryActions.
export {
  FetchCommentsByIdError,
  FetchEventError,
  FetchEventTagsError,
  FetchMarketError,
  FetchMarketTagsError,
  FetchPublicProfileError,
  FetchRelatedTagResourcesError,
  FetchRelatedTagsError,
  FetchSeriesError,
  FetchSportsMarketTypesError,
  FetchTagError,
  ListCommentsByUserAddressError,
  ListCommentsError,
  ListEventsError,
  ListMarketsError,
  ListSeriesError,
  ListSportsError,
  ListTagsError,
  ListTeamsError,
  SearchError,
} from '../actions';
