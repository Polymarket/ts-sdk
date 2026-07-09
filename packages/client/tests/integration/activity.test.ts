import { ActivityType, ComboActivityType } from '@polymarket/client';
import { expectPresent, isSameEvmAddress } from '@polymarket/types';
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
          timestamp: expect.any(Number),
          transactionAt: expect.any(String),
          transactionHash: expect.any(String),
          type: expect.any(String),
          wallet: TEST_USER,
        }),
      );

      if (item.type === ComboActivityType.Redeem) {
        expect(item).toHaveProperty('payout');
        expect(item).toEqual(
          expect.objectContaining({
            positionId: expect.any(String),
          }),
        );
      } else {
        expect(item).not.toHaveProperty('payout');
        expect(item).not.toHaveProperty('positionId');
      }
    });
  });
});
