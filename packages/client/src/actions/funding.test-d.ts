import { describe, it } from 'vitest';
import type { PublicFundingActions, SecureFundingActions } from '../decorators';

describe('account-bound funding action types', () => {
  it('requires public callers to choose a wallet', () => {
    const actions = {} as PublicFundingActions;

    actions.createDepositAddresses({
      wallet: '0x0000000000000000000000000000000000000001',
    });
    // @ts-expect-error Public clients do not have an account-bound wallet.
    actions.createDepositAddresses();
  });

  it('does not allow secure callers to override the account wallet', () => {
    const actions = {} as SecureFundingActions;

    actions.createDepositAddresses();
    actions.createDepositAddresses({
      // @ts-expect-error Secure funding actions always use client.account.wallet.
      wallet: '0x0000000000000000000000000000000000000001',
    });
    actions.createWithdrawalAddresses({
      destination: {
        chainId: '137',
        recipientAddress: '0x0000000000000000000000000000000000000001',
        tokenAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      },
      // @ts-expect-error Secure funding actions always use client.account.wallet.
      wallet: '0x0000000000000000000000000000000000000001',
    });
  });
});
