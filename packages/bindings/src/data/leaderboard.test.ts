import { describe, expect, it } from 'vitest';
import {
  FetchBuilderVolumeResponseSchema,
  ListBuilderLeaderboardResponseSchema,
} from './leaderboard';

const BUILDER_CODE = `0x${'ab'.repeat(32)}`;

describe('ListBuilderLeaderboardResponseSchema', () => {
  it('normalizes a page and removes an empty profile image sentinel', () => {
    const page = ListBuilderLeaderboardResponseSchema.parse({
      data: [
        {
          rank: 1,
          builder_name: 'Example builder',
          builder_code: BUILDER_CODE,
          profile_image: '',
          verified: true,
          volume: 123.45,
          active_users: 12,
        },
      ],
      pagination: {
        limit: 1,
        offset: 0,
        has_more: true,
        next_cursor: 'opaque-cursor',
      },
    });

    expect(page).toEqual({
      items: [
        {
          rank: 1,
          builderName: 'Example builder',
          builderCode: BUILDER_CODE,
          verified: true,
          volume: '123.45',
          activeUsers: 12,
        },
      ],
      hasMore: true,
      nextCursor: 'opaque-cursor',
    });
  });
});

describe('FetchBuilderVolumeResponseSchema', () => {
  it('unwraps and normalizes bucket rows', () => {
    const points = FetchBuilderVolumeResponseSchema.parse({
      data: [
        {
          date: '2026-08-30',
          rank: 2,
          builder_name: 'Example builder',
          builder_code: BUILDER_CODE,
          profile_image: 'https://example.invalid/profile.png',
          verified: false,
          volume: 99.5,
          active_users: 7,
        },
      ],
    });

    expect(points).toEqual([
      {
        bucketDate: '2026-08-30',
        rank: 2,
        builderName: 'Example builder',
        builderCode: BUILDER_CODE,
        profileImage: 'https://example.invalid/profile.png',
        verified: false,
        volume: '99.5',
        activeUsers: 7,
      },
    ]);
  });
});
