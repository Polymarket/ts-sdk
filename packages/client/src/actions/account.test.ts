import { AssetType } from '@polymarket/bindings/clob';
import { describe, expect, it } from 'vitest';
import type { SecureAccountActions } from '../decorators';
import { publicClient, safeWalletAddress, walletClient } from '../testing';
import { authenticateWith } from '../viem';
import { fetchBalanceAllowance } from './account';

describe('Account', () => {
  describe('authenticated reads', () => {
    it('fetches authenticated account state', async () => {
      const secureClient = await publicClient
        .beginAuthentication({ wallet: safeWalletAddress })
        .then(authenticateWith(walletClient));

      const [closedOnly, openOrders, trades, notifications, balanceAllowance] =
        await Promise.all([
          secureClient.fetchClosedOnlyMode(),
          secureClient.listOpenOrders().firstPage(),
          secureClient.listAccountTrades().firstPage(),
          secureClient.fetchNotifications(),
          fetchBalanceAllowance(secureClient, {
            assetType: AssetType.COLLATERAL,
          }),
        ]);

      expect(typeof closedOnly).toBe('boolean');
      expect(Array.isArray(openOrders.items)).toBe(true);
      expect(Array.isArray(trades.items)).toBe(true);
      expect(Array.isArray(notifications)).toBe(true);
      expect(balanceAllowance).toEqual(
        expect.objectContaining({
          allowances: expect.any(Object),
          balance: expect.any(String),
        }),
      );
    });
  });

  describe('dropNotifications', () => {
    it('marks notifications as read by id', async () => {
      const secureClient = await publicClient
        .beginAuthentication({ wallet: safeWalletAddress })
        .then(authenticateWith(walletClient));

      const notifications = await secureClient.fetchNotifications();

      if (notifications.length === 0) {
        return;
      }

      const ids = notifications.slice(0, 1).map(({ id }) => `${id}`);

      await expect(
        secureClient.dropNotifications({
          ids,
        }),
      ).resolves.toBeUndefined();

      const remainingNotifications = await waitForNotificationsToClear(
        secureClient,
        ids,
      );

      expect(
        remainingNotifications.some(({ id }) => ids.includes(`${id}`)),
      ).toBe(false);
    });
  });
});

async function waitForNotificationsToClear(
  secureClient: Pick<SecureAccountActions, 'fetchNotifications'>,
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
