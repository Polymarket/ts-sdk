import type { Market } from '@polymarket/client';
import type {
  FetchMarketError,
  FetchMarketRequest,
  ListMarketsError,
  ListMarketsRequest,
} from '@polymarket/client/actions';
import { fetchMarket, listMarkets } from '@polymarket/client/actions';
import type { PaginatedReadResult } from '../pagination';
import { usePublicPaginatedAction } from '../pagination';
import type { ReadResult } from '../read';
import { usePublicClientAction } from '../read';
import type { Skip } from '../skip';

/**
 * Fetches a single market by ID, slug, or Polymarket URL.
 *
 * @remarks
 * Errors surface on `error` as {@link FetchMarketError}. Pass `skip` instead
 * of the request to pause fetching.
 *
 * @example
 * ```tsx
 * const { data: market, error, isLoading } = useMarket({
 *   slug: 'some-market-slug',
 * });
 * ```
 */
export function useMarket(
  request: FetchMarketRequest | Skip,
): ReadResult<Market, FetchMarketError> {
  return usePublicClientAction<FetchMarketRequest, Market, FetchMarketError>(
    fetchMarket,
    request,
  );
}

/**
 * Lists markets as infinite-scroll state.
 *
 * @remarks
 * `data` accumulates markets across all fetched pages; call `fetchNextPage`
 * to load more while `hasNextPage` is true. Errors surface on `error` as
 * {@link ListMarketsError}. Pass `skip` instead of the request to pause
 * fetching.
 *
 * @example
 * ```tsx
 * const { data: markets, fetchNextPage, hasNextPage } = useMarkets({
 *   closed: false,
 * });
 * ```
 */
export function useMarkets(
  request: ListMarketsRequest | Skip = {},
): PaginatedReadResult<Market, ListMarketsError> {
  return usePublicPaginatedAction<ListMarketsRequest, Market, ListMarketsError>(
    listMarkets,
    request,
  );
}
