import {
  CommentParentEntityType,
  toEventId,
  toPaginationCursor,
} from '@polymarket/bindings';
import type { Comment } from '@polymarket/bindings/gamma';
import {
  CommentSort,
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
      expect(urls[0]).toContain('/v1/comments?');
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

    it('defaults to ascending when an order is given', async ({
      publicClient,
    }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await publicClient
        .listComments({ ...request, order: CommentSort.Id })
        .firstPage();

      const urls = fetchSpy.mock.calls.map(([input]) =>
        input instanceof Request ? input.url : String(input),
      );
      expect(urls).toHaveLength(1);
      expect(urls[0]).toContain('/v1/comments?');
      expect(urls[0]).toContain('order=id');
      expect(urls[0]).toContain('ascending=true');
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
        { ...request, order: CommentSort.Id },
        { ...request, ascending: true, order: CommentSort.CreatedAt },
      ];

      for (const other of otherQueries) {
        await expect(
          publicClient.listComments(other).from(nextCursor).firstPage(),
        ).rejects.toThrow(UserInputError);
      }

      // Offset cursors saved from earlier versions, cursors of another shape
      // and raw service tokens cannot resume a cursor walk.
      const foreignCursors = [
        { offset: 200, pageSize: 5 },
        { kind: 'other', offset: 0, pageSize: 5 },
      ].map((state) => toPaginationCursor(btoa(JSON.stringify(state))));
      foreignCursors.push(toPaginationCursor('raw-service-token'));

      for (const foreignCursor of foreignCursors) {
        await expect(
          publicClient.listComments(request).from(foreignCursor).firstPage(),
        ).rejects.toThrow(UserInputError);
      }

      expect(fetchSpy).not.toHaveBeenCalled();
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
