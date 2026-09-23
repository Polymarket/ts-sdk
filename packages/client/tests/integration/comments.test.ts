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

    it('serves offset pages up to the cap and then stops with a typed error when holder filtering keeps the read on offset pages', async ({
      publicClient,
    }) => {
      // A long-running thread with far more than 300 top-level comments, so
      // every page below the cap comes back full. Holder filtering is only
      // served on offset pages, so this read cannot switch to cursors.
      const paginator = publicClient.listComments({
        holdersOnly: true,
        parentEntityId: toEventId('45915'),
        parentEntityType: CommentParentEntityType.Event,
        pageSize: 100,
      });
      const pages: Page<Comment[]>[] = [];

      await expect(async () => {
        for await (const page of paginator) {
          pages.push(page);
        }
      }).rejects.toThrow(PaginationLimitError);

      expect(pages).toHaveLength(3);
      expect(pages[2]?.hasMore).toBe(true);
      expect(pages[2]?.nextCursor).toBeDefined();
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

    it('continues from a saved cursor and sends only cursor parameters', async ({
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
      expect(urls[1]).toContain('after_cursor=');
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
        expect(() =>
          publicClient.listComments(other).from(nextCursor).firstPage(),
        ).toThrow(UserInputError);
      }

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
      expect(() => paginator.from(page.nextCursor).firstPage()).toThrow(
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

      const commentsByUserAddress = await publicClient
        .listCommentsByUserAddress({
          address: expectPresent(comment.userAddress),
          pageSize: 1,
        })
        .firstPage();

      expect(commentsByUserAddress.items).toEqual(expect.any(Array));
    });
  });
});
