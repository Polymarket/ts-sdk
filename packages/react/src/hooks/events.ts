import type { Event } from '@polymarket/client';
import type {
  ListEventsError,
  ListEventsRequest,
} from '@polymarket/client/actions';
import { listEvents } from '@polymarket/client/actions';
import type { PaginatedReadResult } from '../pagination';
import { usePaginatedAction } from '../pagination';
import type { Skip } from '../skip';

/**
 * Lists events as infinite-scroll state.
 *
 * @remarks
 * `data` accumulates events across all fetched pages; call `fetchNextPage`
 * to load more while `hasNextPage` is true. Errors surface on `error` as
 * {@link ListEventsError}. Pass `skip` instead of the request to pause
 * fetching.
 *
 * @example
 * ```tsx
 * const { data: events, fetchNextPage, hasNextPage } = useEvents({
 *   closed: false,
 * });
 * ```
 */
export function useEvents(
  request: ListEventsRequest | Skip = {},
): PaginatedReadResult<Event, ListEventsError> {
  return usePaginatedAction<ListEventsRequest, Event, ListEventsError>(
    listEvents,
    request,
  );
}
