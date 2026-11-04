import { AssetType } from '@polymarket/bindings/clob';
import type { SecureClient } from '@polymarket/client';
import { fetchBalanceAllowance } from '@polymarket/client/actions';
import { describe, expect, it } from './fixtures';

describe('Account', () => {
  describe('fetchRateLimitTier', () => {
    it('fetches the authenticated signer tier', async ({
      secureClientWithDepositWallet,
    }) => {
      const tier = await secureClientWithDepositWallet.fetchRateLimitTier({
        retries: 0,
      });
      expect(typeof tier.tier).toBe('string');
      expect(Number.isInteger(tier.period)).toBe(true);
      expect(typeof tier.tierDetails.orderRatePerSec).toBe('number');
      expect(typeof tier.tierDetails.allowNegative).toBe('boolean');
    });
  });
  describe('fetchClosedOnlyMode', () => {
    it('fetches closed-only mode', async ({
      secureClientWithDepositWallet,
    }) => {
      const closedOnly =
        await secureClientWithDepositWallet.fetchClosedOnlyMode();
      expect(typeof closedOnly).toBe('boolean');
    });
  });

  describe('listOpenOrders', () => {
    it('lists open orders', async ({ secureClientWithDepositWallet }) => {
      const openOrders = await secureClientWithDepositWallet
        .listOpenOrders()
        .firstPage();
      expect(Array.isArray(openOrders.items)).toBe(true);
    });
  });

  describe('listAccountTrades', () => {
    it('lists account trades', async ({ secureClientWithDepositWallet }) => {
      const trades = await secureClientWithDepositWallet
        .listAccountTrades()
        .firstPage();
      expect(Array.isArray(trades.items)).toBe(true);
    });
  });

  describe('fetchNotifications', () => {
    it('fetches notifications', async ({ secureClientWithDepositWallet }) => {
      const notifications =
        await secureClientWithDepositWallet.fetchNotifications();
      expect(Array.isArray(notifications)).toBe(true);
    });
  });

  describe('fetchBalanceAllowance', () => {
    it('fetches balance allowance', async ({
      secureClientWithDepositWallet,
    }) => {
      const balanceAllowance = await fetchBalanceAllowance(
        secureClientWithDepositWallet,
        {
          assetType: AssetType.COLLATERAL,
        },
      );

      expect(balanceAllowance).toEqual(
        expect.objectContaining({
          allowances: expect.any(Object),
          balance: expect.any(String),
        }),
      );
    });
  });

  describe('dropNotifications', () => {
    it('marks notifications as read by id', async ({
      secureClientWithDepositWallet,
    }) => {
      const notifications =
        await secureClientWithDepositWallet.fetchNotifications();

      if (notifications.length === 0) {
        return;
      }

      const ids = notifications.slice(0, 1).map(({ id }) => `${id}`);

      await expect(
        secureClientWithDepositWallet.dropNotifications({
          ids,
        }),
      ).resolves.toBeUndefined();

      const remainingNotifications = await waitForNotificationsToClear(
        secureClientWithDepositWallet,
        ids,
      );

      expect(
        remainingNotifications.some(({ id }) => ids.includes(`${id}`)),
      ).toBe(false);
    });
  });
});

async function waitForNotificationsToClear(
  secureClient: SecureClient,
  ids: string[],
) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const notifications = await secureClient.fetchNotifications();

    if (!notifications.some(({ id }) => ids.includes(`${id}`))) {
      return notifications;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return secureClient.fetchNotifications();
}
