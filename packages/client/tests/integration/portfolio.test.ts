import {
  ComboPositionOutcome,
  ComboPositionSort,
  UserInputError,
} from '@polymarket/client';
import { isSameEvmAddress } from '@polymarket/types';
import { describe, expect, it } from './fixtures';
import { expectNonEmptyPage, expectPageWindow } from './helpers';

const TEST_USER = '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b';

describe('Portfolio', () => {
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

  describe('listClosedPositions', () => {
    it('lists closed positions for a wallet', async ({ publicClient }) => {
      // 50 is the largest allowed pageSize, matching the upstream limit cap.
      const paginator = publicClient.listClosedPositions({
        user: TEST_USER,
        pageSize: 50,
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

    it('rejects page sizes above the upstream limit cap', ({
      publicClient,
    }) => {
      expect(() =>
        publicClient.listClosedPositions({
          user: TEST_USER,
          pageSize: 51,
        }),
      ).toThrow(UserInputError);
    });

    it('defaults secure clients to the authenticated wallet', async ({
      depositWalletAddress,
      secureClientWithDepositWallet,
    }) => {
      const result = await secureClientWithDepositWallet
        .listClosedPositions({ pageSize: 1 })
        .firstPage()
        .then(expectNonEmptyPage);

      expect(result.items[0]?.wallet).toSatisfy((wallet) =>
        isSameEvmAddress(wallet, depositWalletAddress),
      );
    });
  });

  describe('listComboPositions', () => {
    it('lists combo positions for a wallet', async ({ publicClient }) => {
      const paginator = publicClient.listComboPositions({
        user: TEST_USER,
        pageSize: 1,
        sort: ComboPositionSort.FirstEntryDesc,
      });
      const result = await paginator.firstPage().then(expectNonEmptyPage);

      await expectPageWindow(paginator, result, 1);
      expect(Object.values(ComboPositionOutcome)).toContain(
        result.items[0].outcome,
      );
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          conditionId: expect.any(String),
          positionId: expect.any(String),
          redeemable: expect.any(Boolean),
          wallet: TEST_USER,
          realizedPayoutUsdc: expect.any(String),
          totalCostUsdc: expect.any(String),
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
