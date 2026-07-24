import type {
  BaseClient,
  Comment,
  MetaHolder,
  PublicProfile,
  RelatedTag,
  Tag,
  TraderLeaderboardEntry,
} from '@polymarket/client';
import type {
  FetchPublicProfileError,
  FetchPublicProfileRequest,
  FetchRelatedTagsError,
  FetchRelatedTagsRequest,
  ListCommentsError,
  ListCommentsRequest,
  ListMarketHoldersError,
  ListMarketHoldersRequest,
  ListTagsError,
  ListTagsRequest,
  ListTraderLeaderboardError,
  ListTraderLeaderboardRequest,
  SearchError,
  SearchRequest,
  SearchResults,
} from '@polymarket/client/actions';
import {
  fetchPublicProfile,
  fetchRelatedTags,
  listComments,
  listMarketHolders,
  listTags,
  listTraderLeaderboard,
  search,
} from '@polymarket/client/actions';
import type { PaginatedReadResult } from '../pagination';
import { usePublicPaginatedAction } from '../pagination';
import type { ReadResult } from '../read';
import { usePublicClientAction } from '../read';
import type { Skip } from '../skip';

function searchFirstPage(
  client: BaseClient,
  request: SearchRequest,
): Promise<SearchResults> {
  return search(client, request)
    .firstPage()
    .then((page) => page.items);
}

/**
 * Searches events, profiles, and tags.
 *
 * @remarks
 * Returns the first page of grouped results — the shape a search box renders.
 * Deeper result browsing can drive the `search` action directly through
 * `usePolymarketClient()`. Errors surface on `error` as {@link SearchError}.
 * Pass `skip` instead of the request to pause, such as while the query is
 * empty.
 *
 * @example
 * ```tsx
 * const { data: results } = useSearch(query ? { q: query } : skip);
 * ```
 */
export function useSearch(
  request: SearchRequest | Skip,
): ReadResult<SearchResults, SearchError> {
  return usePublicClientAction<SearchRequest, SearchResults, SearchError>(
    searchFirstPage,
    request,
  );
}

/**
 * Lists tags as infinite-scroll state, for category navigation.
 *
 * @remarks
 * `data` accumulates tags across all fetched pages. Errors surface on
 * `error` as {@link ListTagsError}. Pass `skip` instead of the request to
 * pause fetching.
 *
 * @example
 * ```tsx
 * const { data: tags } = useTags();
 * ```
 */
export function useTags(
  request: ListTagsRequest | Skip = {},
): PaginatedReadResult<Tag, ListTagsError> {
  return usePublicPaginatedAction<ListTagsRequest, Tag, ListTagsError>(
    listTags,
    request,
  );
}

/**
 * Fetches the tags related to a tag.
 *
 * @remarks
 * Errors surface on `error` as {@link FetchRelatedTagsError}. Pass `skip`
 * instead of the request to pause fetching.
 *
 * @example
 * ```tsx
 * const { data: related } = useRelatedTags({ slug: 'politics' });
 * ```
 */
export function useRelatedTags(
  request: FetchRelatedTagsRequest | Skip,
): ReadResult<RelatedTag[], FetchRelatedTagsError> {
  return usePublicClientAction<
    FetchRelatedTagsRequest,
    RelatedTag[],
    FetchRelatedTagsError
  >(fetchRelatedTags, request);
}

/**
 * Lists comments as infinite-scroll state.
 *
 * @remarks
 * `data` accumulates comments across all fetched pages. Errors surface on
 * `error` as {@link ListCommentsError}. Pass `skip` instead of the request to
 * pause fetching.
 *
 * @example
 * ```tsx
 * const { data: comments, fetchNextPage, hasNextPage } = useComments({
 *   parentEntityType: 'Event',
 *   parentEntityId: event.id,
 * });
 * ```
 */
export function useComments(
  request: ListCommentsRequest | Skip,
): PaginatedReadResult<Comment, ListCommentsError> {
  return usePublicPaginatedAction<
    ListCommentsRequest,
    Comment,
    ListCommentsError
  >(listComments, request);
}

/**
 * Fetches a user's public profile.
 *
 * @remarks
 * `data` is `null` for addresses without a profile. Errors surface on
 * `error` as {@link FetchPublicProfileError}. Pass `skip` instead of the
 * request to pause fetching.
 *
 * @example
 * ```tsx
 * const { data: profile } = usePublicProfile({ address });
 * ```
 */
export function usePublicProfile(
  request: FetchPublicProfileRequest | Skip,
): ReadResult<PublicProfile | null, FetchPublicProfileError> {
  return usePublicClientAction<
    FetchPublicProfileRequest,
    PublicProfile | null,
    FetchPublicProfileError
  >(fetchPublicProfile, request);
}

/**
 * Fetches a market's top holders.
 *
 * @remarks
 * Returns a direct collection (the endpoint offers no continuation). Errors
 * surface on `error` as {@link ListMarketHoldersError}. Pass `skip` instead
 * of the request to pause fetching.
 *
 * @example
 * ```tsx
 * const { data: holders } = useMarketHolders({ conditionId });
 * ```
 */
export function useMarketHolders(
  request: ListMarketHoldersRequest | Skip,
): ReadResult<MetaHolder[], ListMarketHoldersError> {
  return usePublicClientAction<
    ListMarketHoldersRequest,
    MetaHolder[],
    ListMarketHoldersError
  >(listMarketHolders, request);
}

/**
 * Lists the trader leaderboard as infinite-scroll state.
 *
 * @remarks
 * `data` accumulates entries across all fetched pages. Errors surface on
 * `error` as {@link ListTraderLeaderboardError}. Pass `skip` instead of the
 * request to pause fetching.
 *
 * @example
 * ```tsx
 * const { data: leaders } = useTraderLeaderboard();
 * ```
 */
export function useTraderLeaderboard(
  request: ListTraderLeaderboardRequest | Skip = {},
): PaginatedReadResult<TraderLeaderboardEntry, ListTraderLeaderboardError> {
  return usePublicPaginatedAction<
    ListTraderLeaderboardRequest,
    TraderLeaderboardEntry,
    ListTraderLeaderboardError
  >(listTraderLeaderboard, request);
}
