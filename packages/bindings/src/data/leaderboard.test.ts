import { describe, expect, it } from 'vitest';
import {
  BiggestWinnerKind,
  FetchBuilderVolumeResponseSchema,
  FetchTraderLeaderboardStandingResponseSchema,
  ListBiggestWinnersResponseSchema,
  ListBuilderLeaderboardResponseSchema,
  ListTraderLeaderboardResponseSchema,
} from './leaderboard';

const BUILDER_CODE = `0x${'ab'.repeat(32)}`;
const WALLET = '0xa71093cafc0c099b4ccab24c3cb8018d817923c4';
const MARKET_CONDITION_ID =
  '0x2ee43c144834af44ab0e677d89807de5608bce1b473d77f7d77cdfe51e4ef9b6';
const COMBO_CONDITION_ID =
  '0x03226d7818f083b4498ac54e8945c5e8a90000000000000000000000000000';
const MARKET_ASSET_ID =
  '106202820389491271897895061818233650528471052556347030624382465719269419234285';
const COMBO_POSITION_ID =
  '1417766874124101375905411871637299379845694748735178839365809761068049760256';

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

describe('ListTraderLeaderboardResponseSchema', () => {
  it('normalizes a trader page and missing profile metadata', () => {
    const page = ListTraderLeaderboardResponseSchema.parse({
      data: [
        {
          rank: 1,
          user_id: WALLET,
          pnl: 403832.48803296004,
          volume: 5149.82,
          user_name: 'Talvez10',
          profile_image: '',
          x_username: '',
          verified: false,
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
          wallet: WALLET,
          pnl: '403832.48803296004',
          volume: '5149.82',
          userName: 'Talvez10',
          profileImage: null,
          xUsername: null,
          verified: false,
        },
      ],
      hasMore: true,
      nextCursor: 'opaque-cursor',
    });
  });
});

describe('FetchTraderLeaderboardStandingResponseSchema', () => {
  it('preserves explicit unranked states', () => {
    const standing = FetchTraderLeaderboardStandingResponseSchema.parse({
      data: {
        user_id: WALLET,
        pnl: 100,
        volume: 0,
        rank_pnl: null,
        rank_volume: null,
        user_name: '',
        profile_image: '',
        x_username: '',
        verified: false,
      },
    });

    expect(standing).toEqual({
      wallet: WALLET,
      pnl: '100',
      volume: '0',
      pnlRank: null,
      volumeRank: null,
      userName: null,
      profileImage: null,
      xUsername: null,
      verified: false,
    });
    expect(
      FetchTraderLeaderboardStandingResponseSchema.parse({ data: null }),
    ).toBeNull();
  });
});

describe('ListBiggestWinnersResponseSchema', () => {
  it('normalizes market and Combo winners into distinct variants', () => {
    const page = ListBiggestWinnersResponseSchema.parse({
      data: [
        {
          win_rank: 1,
          kind: 'market',
          user_id: WALLET,
          pnl: 185862.698495,
          initial_value: 140293.28279536465,
          final_value: 326155.98129036464,
          resolved_at: 1788312706,
          condition_id: MARKET_CONDITION_ID,
          position_id: MARKET_ASSET_ID,
          event_id: 924342,
          event_slug: 'example-event',
          event_title: 'Example event',
          user_name: 'Talvez10',
          profile_image: '',
        },
        {
          win_rank: 2,
          kind: 'combo',
          user_id: WALLET,
          pnl: 128035.305038,
          initial_value: 98173.46,
          final_value: 226208.765038,
          resolved_at: 1785865104,
          condition_id: COMBO_CONDITION_ID,
          position_id: COMBO_POSITION_ID,
          event_id: 0,
          event_slug: '',
          event_title: 'First leg / Second leg',
          user_name: '',
          profile_image: '',
        },
      ],
      pagination: {
        limit: 2,
        offset: 0,
        has_more: false,
        next_cursor: null,
      },
    });

    expect(page.items[0]).toEqual({
      rank: 1,
      kind: BiggestWinnerKind.Market,
      wallet: WALLET,
      pnl: '185862.698495',
      initialValue: '140293.28279536465',
      finalValue: '326155.98129036464',
      resolvedAt: 1788312706000,
      conditionId: MARKET_CONDITION_ID,
      assetId: MARKET_ASSET_ID,
      eventId: '924342',
      eventSlug: 'example-event',
      eventTitle: 'Example event',
      userName: 'Talvez10',
      profileImage: null,
    });
    expect(page.items[1]).toEqual({
      rank: 2,
      kind: BiggestWinnerKind.Combo,
      wallet: WALLET,
      pnl: '128035.305038',
      initialValue: '98173.46',
      finalValue: '226208.765038',
      resolvedAt: 1785865104000,
      conditionId: COMBO_CONDITION_ID,
      positionId: COMBO_POSITION_ID,
      eventId: null,
      eventSlug: null,
      eventTitle: 'First leg / Second leg',
      userName: null,
      profileImage: null,
    });
  });
});
