import { ActivityType, ComboActivityType } from '@polymarket/client';
import { expectPresent, isSameEvmAddress } from '@polymarket/types';
import { afterEach, vi } from 'vitest';
import { describe, expect, it } from './fixtures';
import { expectNonEmptyPage, expectPageWindow } from './helpers';

const TEST_USER = '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b';

describe('Activity', () => {
  describe('listTrades', () => {
    it('lists trades for a wallet', async ({ publicClient }) => {
      const result = await publicClient
        .listTrades({
          user: TEST_USER,
          pageSize: 1,
        })
        .firstPage();

      expect(result.items).toHaveLength(1);
      expect(expectPresent(result.items[0])).toEqual(
        expect.objectContaining({
          conditionId: expect.any(String),
          wallet: TEST_USER,
        }),
      );
    });

    it('lists global trades', async ({ publicClient }) => {
      const firstPage = await publicClient
        .listTrades({
          pageSize: 100,
        })
        .firstPage()
        .then(expectNonEmptyPage);

      expect(firstPage.items.length).toBeGreaterThan(0);
    });
  });

  describe('listActivity', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.for([
      { filters: {}, expected: {} },
      {
        filters: { type: [ActivityType.TRADE, ActivityType.DEPOSIT] },
        expected: { type: 'TRADE,DEPOSIT' },
      },
    ])('keeps deposits and withdrawals for filters $filters', async ({
      filters,
      expected,
    }, { publicClient, environment }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await publicClient
        .listActivity({ user: TEST_USER, pageSize: 1, ...filters })
        .firstPage();

      const [input] = expectPresent(fetchSpy.mock.calls[0]);
      const url = new URL(input instanceof Request ? input.url : String(input));
      expect(url.origin + url.pathname).toBe(
        `${environment.predictions.rest}/v1/activity`,
      );
      expect(Object.fromEntries(url.searchParams)).toEqual({
        user: TEST_USER,
        exclude_deposits_withdrawals: 'false',
        limit: '1',
        ...expected,
      });
    });

    it('lists wallet activity', async ({ publicClient }) => {
      const result = await publicClient
        .listActivity({
          user: TEST_USER,
          pageSize: 100,
          type: [ActivityType.TRADE],
        })
        .firstPage()
        .then(expectNonEmptyPage);

      expect(result.items.length).toBeGreaterThan(0);
      expect(expectPresent(result.items[0])).toEqual(
        expect.objectContaining({
          conditionId: expect.any(String),
          type: ActivityType.TRADE,
          wallet: TEST_USER,
        }),
      );
    });

    it('defaults secure clients to the authenticated wallet', async ({
      depositWalletAddress,
      secureClientWithDepositWallet,
    }) => {
      const result = await secureClientWithDepositWallet
        .listActivity({ pageSize: 1, type: [ActivityType.TRADE] })
        .firstPage()
        .then(expectNonEmptyPage);

      expect(expectPresent(result.items[0]).wallet).toSatisfy((wallet) =>
        isSameEvmAddress(wallet, depositWalletAddress),
      );
    });
  });

  describe('listComboActivity', () => {
    it('lists combo lifecycle activity for a wallet', async ({
      publicClient,
    }) => {
      const paginator = publicClient.listComboActivity({
        user: TEST_USER,
        pageSize: 1,
      });
      const result = await paginator.firstPage().then(expectNonEmptyPage);
      const item = expectPresent(result.items[0]);

      await expectPageWindow(paginator, result, 1);
      expect(Object.values(ComboActivityType)).toContain(item.type);
      expect(item).toEqual(
        expect.objectContaining({
          conditionId: expect.any(String),
          positionId: expect.any(String),
          timestamp: expect.any(Number),
          transactionHash: expect.any(String),
          blockNumber: expect.any(Number),
          type: expect.any(String),
          wallet: TEST_USER,
        }),
      );

      const market = expectPresent(expectPresent(item.legs[0]).market);
      expect(market).toMatchObject({
        question: expect.any(String),
        groupItemTitle: expect.any(String),
        sportsMarketType: expect.any(String),
        outcomes: expect.any(Array),
      });
      expect(market.line === null || typeof market.line === 'number').toBe(
        true,
      );

      if (item.type === ComboActivityType.Redeem) {
        expect(item).toHaveProperty('payout');
      } else {
        expect(item).not.toHaveProperty('payout');
      }
    });
  });
});
