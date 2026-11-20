import { AssetType } from '@polymarket/bindings/clob';
import {
  createSecureClient,
  OrderHeartbeatMismatchError,
  type SecureClient,
  UserInputError,
} from '@polymarket/client';
import { fetchBalanceAllowance } from '@polymarket/client/actions';
import { describe, expect, it } from './fixtures';

describe('Account', () => {
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
    it('requires a market for asset filters before requesting orders', ({
      secureClientWithDepositWallet,
    }) => {
      for (const filter of [{ assetId: '1' }, { tokenId: '1' }]) {
        expect(() =>
          // @ts-expect-error Asset filters require a market; JavaScript callers are validated too.
          secureClientWithDepositWallet.listOpenOrders(filter),
        ).toThrow(UserInputError);

        expect(() =>
          secureClientWithDepositWallet.listOpenOrders({
            ...filter,
            market: '   ',
          }),
        ).toThrow(UserInputError);
      }
    });

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

  describe('rewards', () => {
    // Yesterday in UTC: a complete reward day.
    const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const unknownOrderId = `0x${'0'.repeat(64)}`;

    it('fetches reward percentages by market', async ({
      secureClientWithDepositWallet,
    }) => {
      const percentages =
        await secureClientWithDepositWallet.fetchRewardPercentages();
      for (const percentage of Object.values(percentages))
        expect(typeof percentage).toBe('number');
    });

    it('fetches total earnings for a day, with and without sponsored rewards', async ({
      secureClientWithDepositWallet,
    }) => {
      for (const sponsored of [false, true]) {
        const earnings =
          await secureClientWithDepositWallet.fetchTotalEarningsForUserForDay({
            date: day,
            sponsored,
          });
        expect(Array.isArray(earnings)).toBe(true);
      }
    });

    it('lists earnings for a day', async ({
      secureClientWithDepositWallet,
    }) => {
      const page = await secureClientWithDepositWallet
        .listUserEarningsForDay({ date: day })
        .firstPage();
      expect(Array.isArray(page.items)).toBe(true);
    });

    it('lists market reward configuration with earnings for a day', async ({
      secureClientWithDepositWallet,
    }) => {
      const page = await secureClientWithDepositWallet
        .listUserEarningsAndMarketsConfig({ date: day, pageSize: 5 })
        .firstPage();
      expect(page.items.length).toBeGreaterThan(0);
      expect(page.items.length).toBeLessThanOrEqual(5);
    });

    it('reports an unknown order as not scoring', async ({
      secureClientWithDepositWallet,
    }) => {
      await expect(
        secureClientWithDepositWallet.fetchOrderScoring({
          orderId: unknownOrderId,
        }),
      ).resolves.toBe(false);
      await expect(
        secureClientWithDepositWallet.fetchOrdersScoring({
          orderIds: [unknownOrderId],
        }),
      ).resolves.toEqual({ [unknownOrderId]: false });
    });
  });

  describe('sendOrderHeartbeat', () => {
    // The first accepted heartbeat arms a cancel-all deadline that cannot be
    // disarmed. A fresh signer has no orders, so it has nothing to cancel.
    it('chains heartbeats and recovers from a stale heartbeat ID', async ({
      environment,
      randomEoaSigner,
    }) => {
      const secureClient = await createSecureClient({
        environment,
        signer: randomEoaSigner,
        walletSetup: false,
      });

      try {
        const first = await secureClient.sendOrderHeartbeat();
        const second = await secureClient.sendOrderHeartbeat({
          heartbeatId: first.heartbeatId,
        });
        expect(second.heartbeatId).not.toBe(first.heartbeatId);

        // A stale ID is rejected with the ID the server expects next.
        const mismatch = await secureClient
          .sendOrderHeartbeat({ heartbeatId: first.heartbeatId })
          .then(
            () => undefined,
            (error: unknown) => error,
          );
        expect(mismatch).toBeInstanceOf(OrderHeartbeatMismatchError);
        if (!(mismatch instanceof OrderHeartbeatMismatchError)) return;
        await expect(
          secureClient.sendOrderHeartbeat({
            heartbeatId: mismatch.heartbeatId,
          }),
        ).resolves.toMatchObject({ heartbeatId: expect.any(String) });
      } finally {
        await secureClient.endAuthentication();
      }
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
