import {
  type PaginationCursor,
  toPaginationCursor,
} from '@polymarket/bindings';
import { type ResultAsync, unwrap } from '@polymarket/types';
import { z } from 'zod';
import { UserInputError } from './errors';

export const PageSizeSchema = z.number().int().positive();

export type Page<T> = {
  items: T;
  hasMore: boolean;
  nextCursor?: PaginationCursor;
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
      firstPage() {
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

          if (!page.hasMore) {
            return;
          }

          currentCursor = page.nextCursor;
        }
      },
    };
  }

  return createPaginator();
}

/**
 * Computes the `limit` for an offset lookahead request. Requests one extra row
 * to detect a following page, capped at the endpoint's maximum limit so the
 * lookahead row is never clamped away.
 *
 * @internal
 */
export function offsetRequestLimit(pageSize: number, maxLimit: number): number {
  return Math.min(pageSize + 1, maxLimit);
}

/**
 * Builds a `Page` from the rows of an offset lookahead request. When the
 * request limit was capped at the endpoint's maximum limit, a full page is
 * treated as potentially non-terminal; the following request may yield a
 * final empty page.
 *
 * @internal
 */
export function toOffsetPage<T>(
  rows: T[],
  state: OffsetCursorState,
  maxLimit: number,
): Page<T[]> {
  const hasMore =
    state.pageSize < maxLimit
      ? rows.length > state.pageSize
      : rows.length >= state.pageSize;

  return {
    items: rows.slice(0, state.pageSize),
    hasMore,
    nextCursor: hasMore
      ? encodeOffsetCursor({
          offset: state.offset + state.pageSize,
          pageSize: state.pageSize,
        })
      : undefined,
  };
}

/** @internal */
export function encodeOffsetCursor(state: OffsetCursorState): PaginationCursor {
  return toPaginationCursor(
    btoa(JSON.stringify(OffsetCursorStateSchema.parse(state))),
  );
}

/** @internal */
export function decodeOffsetCursor(
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
