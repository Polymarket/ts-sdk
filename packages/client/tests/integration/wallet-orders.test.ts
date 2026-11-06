import { UserInputError } from '@polymarket/client';
import { describe, expect, it } from './fixtures';

describe('Wallet-wide orders', () => {
  it('reads the authenticated wallet without builder credentials', async ({
    secureClientWithDepositWallet,
  }) => {
    const firstPage = await secureClientWithDepositWallet
      .listWalletOpenOrders()
      .firstPage();
    expect(Array.isArray(firstPage.items)).toBe(true);
    expect(firstPage.hasMore).toBe(firstPage.nextCursor !== undefined);
    for (const order of firstPage.items) {
      expect(order.makerAddress.toLowerCase()).toBe(
        secureClientWithDepositWallet.account.wallet.toLowerCase(),
      );
      expect(order.signerAddress).toMatch(/^0x[0-9a-f]{40}$/i);
    }
  });

  it('rejects ambiguous cancellation modes before sending a request', async ({
    secureClientWithDepositWallet,
  }) => {
    const ambiguous = { all: true as const, orderIds: [`0x${'a'.repeat(64)}`] };
    await expect(
      // @ts-expect-error Exercise the runtime boundary for untyped callers.
      secureClientWithDepositWallet.cancelWalletOrders(ambiguous),
    ).rejects.toBeInstanceOf(UserInputError);
    await expect(
      secureClientWithDepositWallet.cancelWalletOrders({ orderIds: [] }),
    ).rejects.toBeInstanceOf(UserInputError);
  });
});
