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
  /**
   * Whether another page may be available.
   *
   * On methods without a server-provided continuation signal, a full page
   * reports `true` and the follow-up request returns an empty final page when
   * the collection ended exactly on a page boundary.
   */
  hasMore: boolean;
  nextCursor?: PaginationCursor;
  /** Total number of matching items across all pages. Only present when the service reports one. */
  totalCount?: number;
};

export type Paginated<
  T,
  TPage extends Page<T> = Page<T>,
> = AsyncIterable<TPage> & {
  firstPage(): Promise<TPage>;
  from(cursor?: PaginationCursor): Paginated<T, TPage>;
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
export function paginate<T, TError, TPage extends Page<T> = Page<T>>(
  fetchPage: (
    cursor?: PaginationCursor,
  ) => ResultAsync<Page<T> & TPage, TError>,
  initialCursor?: PaginationCursor,
  emptyItems: T = [] as T,
  emptyPage?: () => NoInfer<TPage>,
): Paginated<T, TPage> {
  function createEmptyPaginator(): Paginated<T, TPage> {
    return {
      async firstPage() {
        return emptyPage === undefined
          ? ({ items: emptyItems, hasMore: false } as TPage)
          : emptyPage();
      },
      from() {
        return createEmptyPaginator();
      },
      async *[Symbol.asyncIterator]() {},
    };
  }

  function createPaginator(cursor = initialCursor): Paginated<T, TPage> {
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
