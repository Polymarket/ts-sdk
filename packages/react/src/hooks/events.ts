import type { Event } from '@polymarket/client';
import type {
  FetchEventError,
  FetchEventRequest,
  ListEventsError,
  ListEventsRequest,
} from '@polymarket/client/actions';
import { fetchEvent, listEvents } from '@polymarket/client/actions';
import type { PaginatedReadResult } from '../pagination';
import { usePublicPaginatedAction } from '../pagination';
import type { ReadResult } from '../read';
import { usePublicClientAction } from '../read';
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
  return usePublicPaginatedAction<ListEventsRequest, Event, ListEventsError>(
    listEvents,
    request,
  );
}

/**
 * Fetches a single event by ID, slug, or Polymarket URL.
 *
 * @remarks
 * Errors surface on `error` as {@link FetchEventError}. Pass `skip` instead
 * of the request to pause fetching.
 *
 * @example
 * ```tsx
 * const { data: event, isLoading } = useEvent({ slug: 'some-event-slug' });
 * ```
 */
export function useEvent(
  request: FetchEventRequest | Skip,
): ReadResult<Event, FetchEventError> {
  return usePublicClientAction<FetchEventRequest, Event, FetchEventError>(
    fetchEvent,
    request,
  );
}
