import {
  ComboPositionSortBy,
  ComboPositionStatus,
  PositionStatus,
  UserInputError,
} from '@polymarket/client';
import { expectPresent, isSameEvmAddress } from '@polymarket/types';
import { afterEach, type MockInstance, vi } from 'vitest';
import { describe, expect, it } from './fixtures';
import { expectNonEmptyPage, expectPageWindow } from './helpers';

const TEST_USER = '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b';
const TEST_CONDITION_ID =
  '0x7ad403c3508f8e3912940fd1a913f227591145ca0614074208e0b962d5fcc422';

describe('Portfolio', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listPositions', () => {
    it('lists positions for a wallet', async ({ publicClient }) => {
      const paginator = publicClient.listPositions({
        user: TEST_USER,
        pageSize: 100,
      });
      const result = await paginator.firstPage().then(expectNonEmptyPage);

      expect(result.items.length).toBeGreaterThan(0);
      await expectPageWindow(paginator, result, 99);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          conditionId: expect.any(String),
          wallet: TEST_USER,
        }),
      );
    });

    it('defaults secure clients to the authenticated wallet', async ({
      depositWalletAddress,
      secureClientWithDepositWallet,
    }) => {
      const result = await secureClientWithDepositWallet
        .listPositions({ pageSize: 1 })
        .firstPage()
        .then(expectNonEmptyPage);

      expect(result.items[0]?.wallet).toSatisfy((wallet) =>
        isSameEvmAddress(wallet, depositWalletAddress),
      );
    });
  });

  describe('listPositions status arms', () => {
    it('lists closed positions via status', async ({ publicClient }) => {
      const result = await publicClient
        .listPositions({
          user: TEST_USER,
          status: PositionStatus.Closed,
          pageSize: 50,
        })
        .firstPage()
        .then(expectNonEmptyPage);

      expect(result.items.length).toBeGreaterThan(0);
      for (const position of result.items) {
        expect(position.status).toBe(PositionStatus.Closed);
        expect(position.wallet).toBe(TEST_USER);
      }
    });
  });

  describe('listComboPositions', () => {
    it('lists combo positions for a wallet', async ({ publicClient }) => {
      const paginator = publicClient.listComboPositions({
        user: TEST_USER,
        pageSize: 1,
        sortBy: ComboPositionSortBy.FirstEntry,
      });
      const result = await paginator.firstPage().then(expectNonEmptyPage);

      await expectPageWindow(paginator, result, 1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          conditionId: expect.any(String),
          positionId: expect.any(String),
          outcomeLabel: expect.any(String),
          redeemable: expect.any(Boolean),
          wallet: TEST_USER,
          realizedPayoutUsdc: expect.any(Number),
          grossEntryCostUsdc: expect.any(String),
          entryFeesUsdc: expect.any(String),
        }),
      );

      const filtered = await publicClient
        .listComboPositions({
          user: TEST_USER,
          pageSize: 1,
          conditionId: result.items[0].conditionId,
        })
        .firstPage()
        .then(expectNonEmptyPage);

      expect(filtered.items[0].conditionId).toBe(result.items[0].conditionId);
    });

    it('filters by one status', async ({ publicClient }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const result = await publicClient
        .listComboPositions({
          user: TEST_USER,
          pageSize: 10,
          status: ComboPositionStatus.ResolvedWin,
        })
        .firstPage()
        .then(expectNonEmptyPage);

      for (const position of result.items) {
        expect(position.status).toBe(ComboPositionStatus.ResolvedWin);
      }

      const requests = comboPositionRequests(fetchSpy);
      expect(requests).toHaveLength(1);
      expect(expectPresent(requests[0]).getAll('status')).toEqual([
        ComboPositionStatus.ResolvedWin,
      ]);
    });

    it('serializes multiple statuses once and retains them across pages', async ({
      publicClient,
    }) => {
      const statuses = [
        ComboPositionStatus.ResolvedWin,
        ComboPositionStatus.ResolvedPartial,
        ComboPositionStatus.ResolvedLoss,
      ] as const;
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const paginator = publicClient.listComboPositions({
        user: TEST_USER,
        pageSize: 1,
        status: statuses,
      });
      const firstPage = await paginator.firstPage().then(expectNonEmptyPage);
      const secondPage = await paginator
        .from(firstPage.nextCursor)
        .firstPage()
        .then(expectNonEmptyPage);

      for (const position of [...firstPage.items, ...secondPage.items]) {
        expect(statuses).toContain(position.status);
      }

      const requests = comboPositionRequests(fetchSpy);
      expect(requests).toHaveLength(2);

      for (const request of requests) {
        expect(request.getAll('status')).toEqual([statuses.join(',')]);
      }

      expect(expectPresent(requests[0]).get('cursor')).toBeNull();
      expect(expectPresent(requests[1]).get('cursor')).toBe(
        firstPage.nextCursor,
      );
    });

    it('rejects invalid status filters before transport', ({
      publicClient,
    }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const invalidStatuses = [
        `${ComboPositionStatus.Open},${ComboPositionStatus.Partial}`,
        [],
        [ComboPositionStatus.Open, 'UNKNOWN'],
      ];

      for (const status of invalidStatuses) {
        expect(() =>
          publicClient.listComboPositions({
            user: TEST_USER,
            status: status as never,
          }),
        ).toThrow(UserInputError);
      }

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('fetchPortfolioValue', () => {
    it('fetches wallet value', async ({ publicClient }) => {
      const result = await publicClient.fetchPortfolioValue({
        user: TEST_USER,
      });

      expect(result).toEqual(
        expect.objectContaining({
          wallet: TEST_USER,
          value: expect.any(String),
        }),
      );
    });

    it('sends condition filters with the canonical query key', async ({
      publicClient,
    }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await publicClient.fetchPortfolioValue({
        user: TEST_USER,
        conditionIds: [TEST_CONDITION_ID],
      });

      const [request] = dataRequests(fetchSpy, '/v2/value');
      expect(request?.get('condition')).toBe(TEST_CONDITION_ID);
      expect(request?.has('condition_id')).toBe(false);
      expect(request?.has('market')).toBe(false);
    });

    it('defaults secure clients to the authenticated wallet', async ({
      depositWalletAddress,
      secureClientWithDepositWallet,
    }) => {
      const result = await secureClientWithDepositWallet.fetchPortfolioValue();

      expect(result.wallet).toSatisfy((wallet) =>
        isSameEvmAddress(wallet, depositWalletAddress),
      );
    });
  });

  describe('fetchUserStats', () => {
    it('fetches profile and lifetime trading stats', async ({
      publicClient,
    }) => {
      const result = await publicClient
        .fetchUserStats({
          user: TEST_USER,
        })
        .then(expectPresent);
      const pnl = expectPresent(result.allTimePnl);

      expect(result).toEqual(
        expect.objectContaining({
          wallet: TEST_USER,
          trades: expect.any(Number),
          biggestWin: expect.any(String),
          views: expect.any(Number),
          joinDate: expect.any(Number),
        }),
      );
      expect(pnl).toEqual(
        expect.objectContaining({
          timestamp: expect.any(Number),
          sourceBlock: expect.any(Number),
          realizedPnl: expect.any(String),
          volume: expect.any(String),
          volumeUsdc: expect.any(String),
          tradeCount: expect.any(Number),
        }),
      );
    });

    it('defaults secure clients to the authenticated wallet', async ({
      depositWalletAddress,
      secureClientWithDepositWallet,
    }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await secureClientWithDepositWallet.fetchUserStats();

      const [request] = dataRequests(fetchSpy, '/v2/user-stats');
      expect(request?.get('user')).toSatisfy(
        (user) => user !== null && isSameEvmAddress(user, depositWalletAddress),
      );
    });
  });

  describe('downloadAccountingSnapshot', () => {
    it('downloads the accounting snapshot archive', async ({
      publicClient,
    }) => {
      const result = await publicClient.downloadAccountingSnapshot({
        user: TEST_USER,
      });

      expect(result).toBeInstanceOf(Blob);
      expect(result.size).toBeGreaterThan(0);
      expect(result.type).toBe('application/zip');
    });

    it('defaults secure clients to the authenticated wallet', async ({
      secureClientWithDepositWallet,
    }) => {
      const result =
        await secureClientWithDepositWallet.downloadAccountingSnapshot();

      expect(result).toBeInstanceOf(Blob);
      expect(result.size).toBeGreaterThan(0);
      expect(result.type).toBe('application/zip');
    });
  });
});

function comboPositionRequests(
  fetchSpy: MockInstance<typeof fetch>,
): URLSearchParams[] {
  return dataRequests(fetchSpy, '/v2/positions/combos');
}

function dataRequests(
  fetchSpy: MockInstance<typeof fetch>,
  pathname: string,
): URLSearchParams[] {
  return fetchSpy.mock.calls
    .map(([input]) => (input instanceof Request ? input.url : String(input)))
    .filter((url) => new URL(url).pathname === pathname)
    .map((url) => new URL(url).searchParams);
}
