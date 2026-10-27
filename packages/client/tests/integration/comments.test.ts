import {
  CommentParentEntityType,
  toEventId,
  toPaginationCursor,
} from '@polymarket/bindings';
import type { Comment } from '@polymarket/bindings/gamma';
import {
  createPublicClient,
  type Page,
  PaginationLimitError,
  UserInputError,
} from '@polymarket/client';
import { expectPresent } from '@polymarket/types';
import { afterEach, vi } from 'vitest';
import { describe, environment, expect, it } from './fixtures';
import { expectNonEmptyPage } from './helpers';

const {
  items: [event],
} = await createPublicClient({ environment })
  .listEvents({
    closed: false,
    pageSize: 1,
  })
  .firstPage()
  .then(expectNonEmptyPage);

const commentEvent = event;

describe('Comments', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listComments', () => {
    it('fetches comments for an event', async ({ publicClient }) => {
      const firstPage = await publicClient
        .listComments({
          parentEntityId: commentEvent.id,
          parentEntityType: CommentParentEntityType.Event,
          pageSize: 100,
        })
        .firstPage();

      expect(firstPage.items).toEqual(expect.any(Array));
    });

    for (const pageSize of [100, 75]) {
      it(`stops normally at the depth limit with page size ${pageSize} when holder filtering keeps the read on offset pages`, async ({
        publicClient,
      }) => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        // A long-running thread with far more than 300 top-level comments, so
        // every page below the cap comes back full. Holder filtering is only
        // served on offset pages, so this read cannot switch to cursors.
        const paginator = publicClient.listComments({
          holdersOnly: true,
          parentEntityId: toEventId('45915'),
          parentEntityType: CommentParentEntityType.Event,
          pageSize,
        });
        const pages: Page<Comment[]>[] = [];

        for await (const page of paginator) {
          pages.push(page);
        }

        expect(pages).toHaveLength(3);
        const lastPage = expectPresent(pages.at(-1));
        expect(lastPage.hasMore).toBe(true);
        expect(lastPage.limitReached).toBe(true);
        expect(lastPage.nextCursor).toBeDefined();
        expect(pages.slice(0, -1).every((page) => !page.limitReached)).toBe(
          true,
        );

        const requests = fetchSpy.mock.calls
          .map(
            ([input]) =>
              new URL(input instanceof Request ? input.url : String(input)),
          )
          .filter((url) => url.pathname === '/comments');
        expect(requests.map((url) => url.searchParams.get('offset'))).toEqual(
          [0, pageSize, 2 * pageSize].map(String),
        );
        fetchSpy.mockClear();
        await expect(
          paginator.from(lastPage.nextCursor).firstPage(),
        ).rejects.toThrow(PaginationLimitError);
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    }
  });

  describe('listComments by server cursor', () => {
    const request = {
      parentEntityId: toEventId('45915'),
      parentEntityType: CommentParentEntityType.Event,
      pageSize: 5,
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('pages a long thread newest first with distinct cursors', async ({
      publicClient,
    }) => {
      const pages: Page<Comment[]>[] = [];

      for await (const page of publicClient.listComments(request)) {
        pages.push(page);

        if (pages.length === 3) {
          break;
        }
      }

      const roots = pages.map((page) =>
        page.items.filter((comment) => comment.parentCommentID == null),
      );
      const rootIds = roots.flat().map((comment) => comment.id);
      const createdAt = roots
        .flat()
        .map((comment) => Date.parse(String(comment.createdAt)));

      expect(pages).toHaveLength(3);
      expect(roots.map((page) => page.length)).toEqual([5, 5, 5]);
      expect(pages.every((page) => page.hasMore)).toBe(true);
      expect(new Set(pages.map((page) => page.nextCursor)).size).toBe(3);
      expect(new Set(rootIds).size).toBe(rootIds.length);
      expect(createdAt).toEqual([...createdAt].sort((a, b) => b - a));
    });

    it('continues from a saved cursor with the same order and direction', async ({
      publicClient,
    }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const paginator = publicClient.listComments(request);
      const firstPage = await paginator.firstPage();
      const secondPage = await paginator.from(firstPage.nextCursor).firstPage();

      const firstIds = new Set(firstPage.items.map((comment) => comment.id));
      expect(secondPage.items.some((comment) => firstIds.has(comment.id))).toBe(
        false,
      );

      const urls = fetchSpy.mock.calls.map(([input]) =>
        input instanceof Request ? input.url : String(input),
      );
      expect(urls).toHaveLength(2);
      expect(urls[0]).toContain('/comments/keyset?');
      expect(urls[0]).toContain('order=createdAt');
      expect(urls[0]).toContain('ascending=false');
      expect(urls[0]).toContain('limit=5');
      expect(urls[0]).not.toContain('offset=');
      expect(urls[0]).not.toContain('holders_only');
      expect(urls[0]).not.toContain('get_positions');
      // Replaying the service token with the default direction would seek
      // the wrong way, so the continuation re-sends the pinned direction.
      expect(urls[1]).toContain('after_cursor=');
      expect(urls[1]).toContain('ascending=false');
      expect(urls[1]).toContain('order=createdAt');
    });

    it('defaults to ascending when an order is given and stays on offset pages otherwise', async ({
      publicClient,
    }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await publicClient.listComments({ ...request, order: 'id' }).firstPage();
      await publicClient
        .listComments({ ...request, order: 'reactionCount' })
        .firstPage();

      const urls = fetchSpy.mock.calls.map(([input]) =>
        input instanceof Request ? input.url : String(input),
      );
      expect(urls).toHaveLength(2);
      expect(urls[0]).toContain('/comments/keyset?');
      expect(urls[0]).toContain('order=id');
      expect(urls[0]).toContain('ascending=true');
      expect(urls[1]).toContain('/comments?');
      expect(urls[1]).toContain('order=reactionCount');
      expect(urls[1]).toContain('offset=0');
    });

    it('refuses a cursor reused for a different query before any request', async ({
      publicClient,
    }) => {
      const { nextCursor } = await publicClient
        .listComments(request)
        .firstPage();
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const otherQueries = [
        { ...request, parentEntityId: commentEvent.id },
        { ...request, order: 'id' },
        { ...request, ascending: true, order: 'createdAt' },
      ];

      for (const other of otherQueries) {
        await expect(
          publicClient.listComments(other).from(nextCursor).firstPage(),
        ).rejects.toThrow(UserInputError);
      }

      // A cursor of some other shape is not silently treated as an offset.
      const foreignCursor = toPaginationCursor(
        btoa(JSON.stringify({ kind: 'other', offset: 0, pageSize: 5 })),
      );
      await expect(
        publicClient.listComments(request).from(foreignCursor).firstPage(),
      ).rejects.toThrow(UserInputError);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('continues a cursor minted before cursor pagination on offset pages', async ({
      publicClient,
    }) => {
      const legacyCursor = toPaginationCursor(
        btoa(JSON.stringify({ offset: 200, pageSize: 100 })),
      );
      const paginator = publicClient.listComments({
        ...request,
        pageSize: 100,
      });
      const page = await paginator.from(legacyCursor).firstPage();

      expect(page.items.length).toBeGreaterThan(0);
      expect(page.hasMore).toBe(true);
      expect(page.limitReached).toBe(true);
      await expect(paginator.from(page.nextCursor).firstPage()).rejects.toThrow(
        PaginationLimitError,
      );
    });
  });

  describe('fetchCommentsById', () => {
    it('fetches related comment threads by id', async ({ publicClient }) => {
      const {
        items: [comment],
      } = await publicClient
        .listComments({
          parentEntityId: commentEvent.id,
          parentEntityType: CommentParentEntityType.Event,
        })
        .firstPage()
        .then(expectNonEmptyPage);

      const commentsById = await publicClient.fetchCommentsById({
        id: comment.id,
      });

      expect(commentsById).toEqual(expect.any(Array));
    });
  });

  describe('listCommentsByUserAddress', () => {
    it('lists comments by user address', async ({ publicClient }) => {
      const {
        items: [comment],
      } = await publicClient
        .listComments({
          parentEntityId: commentEvent.id,
          parentEntityType: CommentParentEntityType.Event,
        })
        .firstPage()
        .then(expectNonEmptyPage);

      const paginator = publicClient.listCommentsByUserAddress({
        address: expectPresent(comment.userAddress),
        pageSize: 1,
      });
      const commentsByUserAddress = await paginator.firstPage();

      expect(commentsByUserAddress.items).toEqual(expect.any(Array));
      expect(commentsByUserAddress.limitReached).toBe(false);
    });

    it('marks a full by-address boundary page and refuses explicit continuation', async ({
      publicClient,
    }) => {
      // An established commenter on the long-running thread above, with more
      // than 200 comments, so this exercises a full boundary page.
      const paginator = publicClient.listCommentsByUserAddress({
        address: '0xcd31bccc0088a4b0f0f07d83319165857fdb8e10',
        pageSize: 1,
        order: 'createdAt',
        ascending: false,
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const boundaryCursor = toPaginationCursor(
        btoa(JSON.stringify({ offset: 200, pageSize: 1 })),
      );
      const pages: Page<Comment[]>[] = [];
      for await (const page of paginator.from(boundaryCursor)) {
        pages.push(page);
      }

      expect(pages).toHaveLength(1);
      const lastPage = expectPresent(pages[0]);
      expect(lastPage.items).toHaveLength(1);
      expect(lastPage.hasMore).toBe(true);
      expect(lastPage.limitReached).toBe(true);
      const requests = fetchSpy.mock.calls.map(
        ([input]) =>
          new URL(input instanceof Request ? input.url : String(input)),
      );
      expect(requests).toHaveLength(1);
      expect(requests[0]?.searchParams.get('offset')).toBe('200');
      fetchSpy.mockClear();
      await expect(
        paginator.from(lastPage.nextCursor).firstPage(),
      ).rejects.toThrow(PaginationLimitError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
