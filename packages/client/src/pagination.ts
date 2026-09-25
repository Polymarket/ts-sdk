import {
  type PaginationCursor,
  toPaginationCursor,
} from '@polymarket/bindings';
import { type ResultAsync, unwrap } from '@polymarket/types';
import { z } from 'zod';
import { PaginationLimitError, UserInputError } from './errors';

export const PageSizeSchema = z.number().int().positive();

export type Page<T> = {
  items: T;
  /**
   * Whether another page may be available.
   *
   * On methods without a server-provided continuation signal, a full page
   * reports `true` and the follow-up request returns an empty final page when
   * the collection ended exactly on a page boundary.
   *
   * A depth-limited page can report `true` alongside `limitReached`.
   * Automatic iteration stops there; explicitly following its cursor throws
   * {@link PaginationLimitError} before sending a request.
   */
  hasMore: boolean;
  /**
   * Whether the listing's supported depth prevents fetching another page.
   * Automatic iteration yields this page, then stops normally. This signals
   * that completeness cannot be established, not that more items definitely
   * exist. Absent or false when no depth limit stopped continuation.
   */
  limitReached?: boolean;
  nextCursor?: PaginationCursor;
  /** Total number of matching items across all pages. Only present when the service reports one. */
  totalCount?: number;
};

export type Paginated<T> = AsyncIterable<Page<T>> & {
  firstPage(): Promise<Page<T>>;
  from(cursor?: PaginationCursor): Paginated<T>;
};

/** @internal */
type OffsetCursorState = {
  offset: number;
  pageSize: number;
};

/** @internal */
const OffsetCursorStateSchema = z.object({
  offset: z.number().int().min(0),
  pageSize: PageSizeSchema,
});

/** @internal */
export function paginate<T, TError>(
  fetchPage: (cursor?: PaginationCursor) => ResultAsync<Page<T>, TError>,
  initialCursor?: PaginationCursor,
  emptyItems: T = [] as T,
): Paginated<T> {
  function createEmptyPaginator(): Paginated<T> {
    return {
      async firstPage() {
        return {
          items: emptyItems,
          hasMore: false,
        };
      },
      from() {
        return createEmptyPaginator();
      },
      async *[Symbol.asyncIterator]() {},
    };
  }

  function createPaginator(cursor = initialCursor): Paginated<T> {
    return {
      async firstPage() {
        return unwrap(fetchPage(cursor));
      },
      from(nextCursor) {
        if (nextCursor === undefined) {
          return createEmptyPaginator();
        }

        return createPaginator(nextCursor);
      },
      async *[Symbol.asyncIterator]() {
        let currentCursor = cursor;

        while (true) {
          const page = await unwrap(fetchPage(currentCursor));

          yield page;

          if (!page.hasMore || page.limitReached) {
            return;
          }

          currentCursor = page.nextCursor;
        }
      },
    };
  }

  return createPaginator();
}

/** @internal */
export function encodeOffsetCursor(state: OffsetCursorState): PaginationCursor {
  return toPaginationCursor(
    btoa(JSON.stringify(OffsetCursorStateSchema.parse(state))),
  );
}

/** @internal */
export type OffsetCursorLimits = {
  /** Largest cursor position the service serves; a cursor past it fails before any request. */
  maxOffset?: number;
  /** Largest page size the service serves; a cursor carrying more fails before any request. */
  maxPageSize?: number;
};

/** @internal */
export function decodeOffsetCursor(
  cursor: PaginationCursor | undefined,
  pageSize: number,
  limits: OffsetCursorLimits = {},
): OffsetCursorState {
  const state = decodeOffsetCursorState(cursor, pageSize);

  // A cursor carries the offset and page size it was minted with, so both are
  // re-checked here rather than trusting the request's page size alone.
  if (limits.maxPageSize !== undefined && state.pageSize > limits.maxPageSize) {
    throw new UserInputError(
      `Pagination cursor page size must be at most ${limits.maxPageSize}`,
    );
  }

  if (limits.maxOffset !== undefined && state.offset > limits.maxOffset) {
    throw new PaginationLimitError(
      `Pagination reached this listing's supported depth limit (${limits.maxOffset}); whether more items exist cannot be established.`,
    );
  }

  return state;
}

function decodeOffsetCursorState(
  cursor: PaginationCursor | undefined,
  pageSize: number,
): OffsetCursorState {
  if (cursor === undefined) {
    return {
      offset: 0,
      pageSize,
    };
  }

  try {
    return OffsetCursorStateSchema.parse(JSON.parse(atob(cursor)));
  } catch (error) {
    throw new UserInputError('Invalid pagination cursor', { cause: error });
  }
}
