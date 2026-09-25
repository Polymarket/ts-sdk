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
      it(`stops normally at the depth limit with page size ${pageSize}`, async ({
        publicClient,
      }) => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        // A long-running thread with far more than 300 top-level comments, so
        // every page below the cap comes back full.
        const paginator = publicClient.listComments({
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
