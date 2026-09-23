import { CommentParentEntityType, toEventId } from '@polymarket/bindings';
import type { Comment } from '@polymarket/bindings/gamma';
import {
  createPublicClient,
  type Page,
  PaginationLimitError,
} from '@polymarket/client';
import { expectPresent } from '@polymarket/types';
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
