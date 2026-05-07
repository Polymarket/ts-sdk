import { WalletType } from '@polymarket/bindings/gamma';
import { expectTxHash } from '@polymarket/types';
import { describe, expect, it } from 'vitest';
import { erc1155ApprovalForAllCall } from '../abis';
import type { BaseSecureClient } from '../clients';
import { production } from '../environments';
import type { TransactionHandle } from '../types';
import {
  prepareAutoRedeemApproval,
  prepareTradingApprovals,
} from './approvals';

const TRANSACTION_HANDLE: TransactionHandle = {
  transactionHash: null,
  transactionId: null,
  async wait() {
    return {
      transactionHash: expectTxHash(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
      ),
      transactionId: null,
    };
  },
};

describe('prepareAutoRedeemApproval', () => {
  it('prepares Conditional Tokens approval for the auto-redeem operator', async () => {
    const client = {
      account: { walletType: WalletType.EOA },
      environment: production,
    } as BaseSecureClient;
    const workflow = await prepareAutoRedeemApproval(client);

    await expect(workflow.next()).resolves.toEqual({
      done: false,
      value: {
        kind: 'sendErc1155ApprovalForAllTransaction',
        request: {
          chainId: production.chainId,
          ...erc1155ApprovalForAllCall(
            production.conditionalTokens,
            production.autoRedeemOperator,
            true,
          ),
        },
      },
    });
  });
});

describe('prepareTradingApprovals', () => {
  it('includes auto-redeem approval in account setup', async () => {
    const client = {
      account: { walletType: WalletType.EOA },
      environment: production,
    } as BaseSecureClient;
    const workflow = await prepareTradingApprovals(client);
    let result = await workflow.next();

    for (let index = 0; index < 6; index += 1) {
      expect(result.done).toBe(false);
      result = await workflow.next(TRANSACTION_HANDLE);
    }

    expect(result).toEqual({
      done: false,
      value: {
        kind: 'sendErc1155ApprovalForAllTransaction',
        request: {
          chainId: production.chainId,
          ...erc1155ApprovalForAllCall(
            production.conditionalTokens,
            production.autoRedeemOperator,
            true,
          ),
        },
      },
    });
  });
});
