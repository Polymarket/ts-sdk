import { expectTransactionHandle, type TransactionCall } from '../types';
import { signerTransactionRequest } from '../workflow';
import type { TradingApprovalsWorkflow } from './approvals';

/** Sends each EOA approval only after the previous transaction is confirmed. */
export async function* prepareEoaTradingApprovals(
  chainId: number,
  erc20Calls: readonly TransactionCall[],
  erc1155Calls: readonly TransactionCall[],
): TradingApprovalsWorkflow {
  for (const call of erc20Calls) {
    const handle = expectTransactionHandle(
      yield {
        kind: 'sendErc20ApprovalTransaction',
        request: signerTransactionRequest(chainId, call),
      },
    );
    await handle.wait();
  }

  for (const call of erc1155Calls) {
    const handle = expectTransactionHandle(
      yield {
        kind: 'sendErc1155ApprovalForAllTransaction',
        request: signerTransactionRequest(chainId, call),
      },
    );
    await handle.wait();
  }
}
