import {
  type ApprovalContract,
  ApprovalStandard,
  type ApprovalsSnapshot,
} from '@polymarket/bindings/data';
import type { EvmAddress } from '@polymarket/types';
import { UnexpectedResponseError } from '../errors';
import type { TradingApprovalRequirements } from './approvals';

/**
 * Resolves SDK-owned requirements against an indexed approval snapshot.
 *
 * Only the rows matching a required token and spender are evaluated; every
 * other row in the snapshot is ignored so catalog growth cannot break reads.
 */
export function resolveIndexedTradingApprovals(
  snapshot: ApprovalsSnapshot,
  wallet: EvmAddress,
  chainId: number,
  required: TradingApprovalRequirements,
): TradingApprovalRequirements {
  if (
    snapshot.address.toLowerCase() !== wallet.toLowerCase() ||
    snapshot.chainId !== chainId
  ) {
    throw new UnexpectedResponseError(
      'Approval snapshot does not match the requested wallet and chain',
    );
  }

  function findApproval(
    token: EvmAddress,
    spender: EvmAddress,
  ): ApprovalContract {
    const matches = snapshot.contracts.filter(
      (row) =>
        row.token.toLowerCase() === token.toLowerCase() &&
        row.spender.toLowerCase() === spender.toLowerCase(),
    );
    const match = matches[0];

    if (matches.length !== 1 || !match) {
      throw new UnexpectedResponseError(
        'Expected exactly one approval row for each required token and spender',
      );
    }

    return match;
  }

  return {
    erc20: required.erc20.filter((approval) => {
      const row = findApproval(approval.tokenAddress, approval.spenderAddress);
      if (row.standard !== ApprovalStandard.Erc20) {
        throw new UnexpectedResponseError('Expected an ERC-20 approval row');
      }

      // Persistent rows report "max" even when unapproved. Exact rows may
      // report a positive finite allowance as approved, below our requirement.
      return (
        !row.approved || (row.amount !== 'max' && row.amount < approval.amount)
      );
    }),
    erc1155: required.erc1155.filter((approval) => {
      const row = findApproval(approval.tokenAddress, approval.operatorAddress);
      if (row.standard !== ApprovalStandard.Erc1155) {
        throw new UnexpectedResponseError('Expected an ERC-1155 approval row');
      }

      return !row.approved;
    }),
  };
}
