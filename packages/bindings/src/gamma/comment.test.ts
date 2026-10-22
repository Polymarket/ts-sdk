import { describe, expect, it } from 'vitest';
import {
  ListCommentsKeysetResponseSchema,
  ListCommentsResponseSchema,
} from './comment';

describe('Comment pages', () => {
  it('preserves every row in mixed Event, PerpsAsset and Series pages', () => {
    const comments = [
      { id: '1', parentEntityType: 'Event', parentEntityID: 1 },
      { id: '2', parentEntityType: 'PerpsAsset', parentEntityID: 7 },
      { id: '3', parentEntityType: 'Series', parentEntityID: 2 },
    ];
    const keyset = ListCommentsKeysetResponseSchema.parse({
      comments,
      next_cursor: 'next-page',
    });
    expect(keyset.nextCursor).toBe('next-page');
    for (const page of [
      ListCommentsResponseSchema.parse(comments),
      keyset.items,
    ]) {
      expect(page.map((comment) => comment.id)).toEqual(['1', '2', '3']);
      expect(page.map((comment) => comment.parentEntityType)).toEqual([
        'Event',
        'PerpsAsset',
        'Series',
      ]);
      expect(page.map((comment) => comment.parentEntityID)).toEqual([
        '1',
        '7',
        '2',
      ]);
    }
  });
});
