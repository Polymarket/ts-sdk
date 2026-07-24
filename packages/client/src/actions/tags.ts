import { PaginationCursorSchema } from '@polymarket/bindings';
import {
  ListRelatedTagResourcesResponseSchema,
  ListRelatedTagsResponseSchema,
  ListTagsResponseSchema,
  type RelatedTag,
  type Tag,
  TagSchema,
} from '@polymarket/bindings/gamma';
import { unwrap } from '@polymarket/types';
import { z } from 'zod';
import type { BaseClient } from '../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import {
  decodeOffsetCursor,
  encodeOffsetCursor,
  PageSizeSchema,
  type Paginated,
  paginate,
} from '../pagination';
import { validateWith } from '../response';
import { snakeCase, toSearchParams } from './params';

const ListTagsRequestSchema = z.object({
  ascending: z.boolean().optional(),
  cursor: PaginationCursorSchema.optional(),
  includeTemplate: z.boolean().optional(),
  isCarousel: z.boolean().optional(),
  locale: z.string().optional(),
  order: z.string().optional(),
  // Matches the upstream per-request limit cap.
  pageSize: PageSizeSchema.max(100).default(20),
});

const FetchTagRequestSchema = z.union([
  z.object({
    id: z.string(),
    includeTemplate: z.boolean().optional(),
    locale: z.string().optional(),
  }),
  z.object({
    slug: z.string(),
    locale: z.string().optional(),
  }),
]);

const RelatedTagsByIdRequestSchema = z.object({
  id: z.string(),
  omitEmpty: z.boolean().optional(),
  status: z.enum(['active', 'closed', 'all']).optional(),
});

const RelatedTagsBySlugRequestSchema = z.object({
  slug: z.string(),
});

const RelatedTagResourcesByIdRequestSchema = z.object({
  id: z.string(),
  locale: z.string().optional(),
  omitEmpty: z.boolean().optional(),
  status: z.enum(['active', 'closed', 'all']).optional(),
});

const RelatedTagResourcesBySlugRequestSchema = z.object({
  locale: z.string().optional(),
  slug: z.string(),
  omitEmpty: z.boolean().optional(),
  status: z.enum(['active', 'closed', 'all']).optional(),
});

export type ListTagsRequest = z.input<typeof ListTagsRequestSchema>;
export type FetchTagRequest = z.input<typeof FetchTagRequestSchema>;
export type FetchRelatedTagsRequest =
  | z.input<typeof RelatedTagsByIdRequestSchema>
  | z.input<typeof RelatedTagsBySlugRequestSchema>;
export type FetchRelatedTagResourcesRequest =
  | z.input<typeof RelatedTagResourcesByIdRequestSchema>
  | z.input<typeof RelatedTagResourcesBySlugRequestSchema>;

export type ListTagsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListTagsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists tags.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListTagsError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listTags(client, {
 *   includeTemplate: true,
 *   pageSize: 12,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: Tag[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listTags(client, {
 *   includeTemplate: true,
 *   pageSize: 12,
 * });
 *
 * for await (const page of result) {
 *   // page.items: Tag[]
 * }
 * ```
 */
export function listTags(
  client: BaseClient,
  request: ListTagsRequest = {},
): Paginated<Tag[]> {
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListTagsRequestSchema,
  );

  return paginate((cursor) => {
    const decoded = decodeOffsetCursor(cursor, pageSize);

    return client.gamma
      .get('/tags', {
        params: toSearchParams(
          {
            ...params,
            limit: decoded.pageSize,
            offset: decoded.offset,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(ListTagsResponseSchema))
      .map((tags) => {
        const hasMore = tags.length >= decoded.pageSize;

        return {
          items: tags,
          hasMore,
          nextCursor: hasMore
            ? encodeOffsetCursor({
                offset: decoded.offset + decoded.pageSize,
                pageSize: decoded.pageSize,
              })
            : undefined,
        };
      });
  }, cursor);
}

export type FetchTagError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchTagError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches a tag by id or slug.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchTagError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const tag = await fetchTag(client, {
 *   slug: 'politics',
 *   locale: 'en',
 * });
 *
 * // tag === Tag
 * ```
 */
export async function fetchTag(
  client: BaseClient,
  request: FetchTagRequest,
): Promise<Tag> {
  const params = parseUserInput(request, FetchTagRequestSchema);

  if ('id' in params) {
    return unwrap(
      client.gamma
        .get(`tags/${params.id}`, {
          params: toSearchParams(
            {
              includeTemplate: params.includeTemplate,
              locale: params.locale,
            },
            snakeCase(),
          ),
        })
        .andThen(validateWith(TagSchema)),
    );
  }

  return unwrap(
    client.gamma
      .get(`tags/slug/${params.slug}`, {
        params: toSearchParams(
          {
            locale: params.locale,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(TagSchema)),
  );
}

export type FetchRelatedTagsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchRelatedTagsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches related tag relationships by id or slug.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchRelatedTagsError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const relatedTags = await fetchRelatedTags(client, {
 *   id: '42',
 *   status: 'active',
 *   omitEmpty: true,
 * });
 *
 * // relatedTags: RelatedTag[]
 * ```
 */
export async function fetchRelatedTags(
  client: BaseClient,
  request: FetchRelatedTagsRequest,
): Promise<RelatedTag[]> {
  if ('id' in request) {
    const params = parseUserInput(request, RelatedTagsByIdRequestSchema);

    return unwrap(
      client.gamma
        .get(`tags/${params.id}/related-tags`, {
          params: toSearchParams(
            {
              omitEmpty: params.omitEmpty,
              status: params.status,
            },
            snakeCase(),
          ),
        })
        .andThen(validateWith(ListRelatedTagsResponseSchema)),
    );
  }

  const params = parseUserInput(request, RelatedTagsBySlugRequestSchema);

  return unwrap(
    client.gamma
      .get(`tags/slug/${params.slug}/related-tags`)
      .andThen(validateWith(ListRelatedTagsResponseSchema)),
  );
}

export type FetchRelatedTagResourcesError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchRelatedTagResourcesError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches resources linked from related tag relationships by id or slug.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchRelatedTagResourcesError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const relatedResources = await fetchRelatedTagResources(client, {
 *   slug: 'election',
 *   status: 'active',
 *   omitEmpty: true,
 * });
 *
 * // relatedResources: Tag[]
 * ```
 */
export async function fetchRelatedTagResources(
  client: BaseClient,
  request: FetchRelatedTagResourcesRequest,
): Promise<Tag[]> {
  if ('id' in request) {
    const params = parseUserInput(
      request,
      RelatedTagResourcesByIdRequestSchema,
    );

    return unwrap(
      client.gamma
        .get(`tags/${params.id}/related-tags/tags`, {
          params: toSearchParams(
            {
              locale: params.locale,
              omitEmpty: params.omitEmpty,
              status: params.status,
            },
            snakeCase(),
          ),
        })
        .andThen(validateWith(ListRelatedTagResourcesResponseSchema)),
    );
  }

  const params = parseUserInput(
    request,
    RelatedTagResourcesBySlugRequestSchema,
  );

  return unwrap(
    client.gamma
      .get(`tags/slug/${params.slug}/related-tags/tags`, {
        params: toSearchParams(
          {
            locale: params.locale,
            omitEmpty: params.omitEmpty,
            status: params.status,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(ListRelatedTagResourcesResponseSchema)),
  );
}
