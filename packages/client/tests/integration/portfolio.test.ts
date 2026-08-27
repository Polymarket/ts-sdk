import {
  ComboPositionStatus,
  PositionStatus,
  UserInputError,
} from '@polymarket/client';
import { expectPresent, isSameEvmAddress } from '@polymarket/types';
import { afterEach, type MockInstance, vi } from 'vitest';
import { describe, expect, it } from './fixtures';
import { expectNonEmptyPage, expectPageWindow } from './helpers';

const TEST_USER = '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b';

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
        sortBy: 'FIRST_ENTRY',
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

      expect(result).toEqual([
        expect.objectContaining({
          user: TEST_USER,
          value: expect.any(String),
        }),
      ]);
    });

    it('defaults secure clients to the authenticated wallet', async ({
      depositWalletAddress,
      secureClientWithDepositWallet,
    }) => {
      const result = await secureClientWithDepositWallet.fetchPortfolioValue();

      expect(result[0]?.user).toSatisfy((user) =>
        isSameEvmAddress(user, depositWalletAddress),
      );
    });
  });

  describe('fetchTradedMarketCount', () => {
    it('fetches total traded market count for a wallet', async ({
      publicClient,
    }) => {
      const result = await publicClient.fetchTradedMarketCount({
        user: TEST_USER,
      });

      expect(result).toEqual(
        expect.objectContaining({
          traded: expect.any(Number),
          user: TEST_USER,
        }),
      );
    });

    it('defaults secure clients to the authenticated wallet', async ({
      depositWalletAddress,
      secureClientWithDepositWallet,
    }) => {
      const result =
        await secureClientWithDepositWallet.fetchTradedMarketCount();

      expect(result.user).toSatisfy((user) =>
        isSameEvmAddress(user, depositWalletAddress),
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
  return fetchSpy.mock.calls
    .map(([input]) => (input instanceof Request ? input.url : String(input)))
    .filter((url) => new URL(url).pathname === '/v2/positions/combos')
    .map((url) => new URL(url).searchParams);
}
