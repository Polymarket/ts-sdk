import {
  BiggestWinnerKind,
  BuilderVolumeInterval,
  LeaderboardWindow,
  TraderLeaderboardSort,
} from '@polymarket/client';
import { expectPresent } from '@polymarket/types';
import { afterEach, type MockInstance, vi } from 'vitest';
import { describe, expect, it } from './fixtures';
import { expectNonEmptyPage } from './helpers';

describe('Leaderboards', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listTraderLeaderboard', () => {
    it('lists normalized trader rankings across cursor pages', async ({
      publicClient,
    }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const paginator = publicClient.listTraderLeaderboard({
        category: 'sports',
        pageSize: 1,
        sortBy: TraderLeaderboardSort.Volume,
        window: LeaderboardWindow.Week,
      });
      const firstPage = await paginator.firstPage().then(expectNonEmptyPage);
      const secondPage = await paginator
        .from(firstPage.nextCursor)
        .firstPage()
        .then(expectNonEmptyPage);

      expect(firstPage.items).toHaveLength(1);
      expect(secondPage.items).toHaveLength(1);
      expect(firstPage.items[0]).toEqual(
        expect.objectContaining({
          pnl: expect.any(String),
          rank: expect.any(Number),
          volume: expect.any(String),
          wallet: expect.stringMatching(/^0x[0-9a-f]{40}$/i),
        }),
      );

      const requests = traderLeaderboardRequests(fetchSpy);
      expect(requests).toHaveLength(2);

      for (const request of requests) {
        expect(request.get('category')).toBe('sports');
        expect(request.get('limit')).toBe('1');
        expect(request.get('sort_by')).toBe(TraderLeaderboardSort.Volume);
        expect(request.get('time_period')).toBe(LeaderboardWindow.Week);
      }

      expect(requests[0]?.get('cursor')).toBeNull();
      expect(requests[1]?.get('cursor')).toBe(firstPage.nextCursor);
    });
  });

  describe('fetchTraderLeaderboardStanding', () => {
    it('composes a ranked wallet into its normalized standing', async ({
      publicClient,
    }) => {
      const leaderboard = await publicClient
        .listTraderLeaderboard({
          category: 'combos',
          pageSize: 1,
          sortBy: TraderLeaderboardSort.Pnl,
          window: LeaderboardWindow.All,
        })
        .firstPage()
        .then(expectNonEmptyPage);

      const standing = expectPresent(
        await publicClient.fetchTraderLeaderboardStanding({
          category: 'combos',
          user: leaderboard.items[0].wallet,
          window: LeaderboardWindow.All,
        }),
      );

      expect(standing).toEqual(
        expect.objectContaining({
          pnl: expect.any(String),
          pnlRank: expect.any(Number),
          volume: expect.any(String),
          volumeRank: null,
          wallet: leaderboard.items[0].wallet,
        }),
      );
    });
  });

  describe('listBiggestWinners', () => {
    it('lists Combo winners without fake event metadata', async ({
      publicClient,
    }) => {
      const page = await publicClient
        .listBiggestWinners({
          category: 'combos',
          pageSize: 1,
          window: LeaderboardWindow.All,
        })
        .firstPage()
        .then(expectNonEmptyPage);

      const winner = page.items[0];
      expect(winner.kind).toBe(BiggestWinnerKind.Combo);

      if (winner.kind !== BiggestWinnerKind.Combo) {
        throw new Error('Expected a Combo winner');
      }

      expect(winner).toEqual(
        expect.objectContaining({
          conditionId: expect.any(String),
          eventId: null,
          eventSlug: null,
          finalValue: expect.any(String),
          initialValue: expect.any(String),
          pnl: expect.any(String),
          positionId: expect.any(String),
          rank: expect.any(Number),
          resolvedAt: expect.any(Number),
          wallet: expect.stringMatching(/^0x[0-9a-f]{40}$/i),
        }),
      );
    });
  });

  describe('listBuilderLeaderboard', () => {
    it('lists normalized builder rankings across cursor pages', async ({
      publicClient,
    }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const paginator = publicClient.listBuilderLeaderboard({
        pageSize: 1,
        window: LeaderboardWindow.All,
      });
      const firstPage = await paginator.firstPage().then(expectNonEmptyPage);
      const secondPage = await paginator
        .from(firstPage.nextCursor)
        .firstPage()
        .then(expectNonEmptyPage);

      expect(firstPage.items).toHaveLength(1);
      expect(secondPage.items).toHaveLength(1);
      expect(firstPage.items[0]).toEqual(
        expect.objectContaining({
          activeUsers: expect.any(Number),
          builderCode: expect.stringMatching(/^0x[0-9a-f]{64}$/i),
          builderName: expect.any(String),
          rank: expect.any(Number),
          volume: expect.any(String),
        }),
      );

      const requests = builderLeaderboardRequests(fetchSpy);
      expect(requests).toHaveLength(2);

      for (const request of requests) {
        expect(request.get('time_period')).toBe(LeaderboardWindow.All);
        expect(request.get('limit')).toBe('1');
      }

      expect(requests[0]?.get('cursor')).toBeNull();
      expect(requests[1]?.get('cursor')).toBe(firstPage.nextCursor);
    });

    it('forwards the requested leaderboard window', async ({
      publicClient,
    }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await publicClient
        .listBuilderLeaderboard({
          pageSize: 1,
          window: LeaderboardWindow.Day,
        })
        .firstPage();

      const requests = builderLeaderboardRequests(fetchSpy);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.get('time_period')).toBe(LeaderboardWindow.Day);
    });
  });

  describe('fetchBuilderVolume', () => {
    it('fetches complete normalized time buckets', async ({ publicClient }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const result = await publicClient.fetchBuilderVolume({
        interval: BuilderVolumeInterval.Day,
        bucketLimit: 2,
      });

      expect(result.length).toBeGreaterThan(2);
      expect(new Set(result.map((point) => point.bucketDate)).size).toBe(2);
      expect(result[0]).toEqual(
        expect.objectContaining({
          activeUsers: expect.any(Number),
          bucketDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          builderCode: expect.stringMatching(/^0x[0-9a-f]{64}$/i),
          builderName: expect.any(String),
          rank: expect.any(Number),
          volume: expect.any(String),
        }),
      );

      const requests = builderVolumeRequests(fetchSpy);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.get('interval')).toBe(BuilderVolumeInterval.Day);
      expect(requests[0]?.get('limit')).toBe('2');
    });
  });
});

function builderLeaderboardRequests(
  fetchSpy: MockInstance<typeof fetch>,
): URLSearchParams[] {
  return dataRequests(fetchSpy, '/v2/builders/leaderboard');
}

function traderLeaderboardRequests(
  fetchSpy: MockInstance<typeof fetch>,
): URLSearchParams[] {
  return dataRequests(fetchSpy, '/v2/leaderboard');
}

function builderVolumeRequests(
  fetchSpy: MockInstance<typeof fetch>,
): URLSearchParams[] {
  return dataRequests(fetchSpy, '/v2/builders/volume');
}

function dataRequests(
  fetchSpy: MockInstance<typeof fetch>,
  path: string,
): URLSearchParams[] {
  return fetchSpy.mock.calls
    .map(([input]) => (input instanceof Request ? input.url : String(input)))
    .filter((url) => new URL(url).pathname === path)
    .map((url) => new URL(url).searchParams);
}
