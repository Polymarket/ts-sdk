import {
  type ApprovalContract,
  ApprovalStandard,
  type ApprovalsSnapshot,
} from '@polymarket/bindings/data';
import type { EvmAddress, HexString } from '@polymarket/types';
import {
  decodeErc20AllowanceResult,
  decodeErc1155IsApprovedForAllResult,
} from '../abis';
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

/** Resolves ordered RPC allowance and operator results against SDK requirements. */
export function resolveRpcTradingApprovals(
  results: readonly HexString[],
  required: TradingApprovalRequirements,
): TradingApprovalRequirements {
  const erc20Results = results.slice(0, required.erc20.length);
  const erc1155Results = results.slice(required.erc20.length);

  try {
    return {
      erc20: required.erc20.filter((approval, index) => {
        const allowance = decodeErc20AllowanceResult(
          erc20Results[index] as HexString,
        );
        return allowance < approval.amount;
      }),
      erc1155: required.erc1155.filter((_, index) => {
        const approved = decodeErc1155IsApprovedForAllResult(
          erc1155Results[index] as HexString,
        );
        return !approved;
      }),
    };
  } catch (error) {
    throw new UnexpectedResponseError(
      'Expected JSON-RPC approval checks to return ABI-encoded values',
      { cause: error },
    );
  }
}
