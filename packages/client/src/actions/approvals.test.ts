import {
  type ApprovalContract,
  ApprovalStandard,
  type ApprovalsSnapshot,
} from '@polymarket/bindings/data';
import { expectEvmAddress, type HexString } from '@polymarket/types';
import { describe, expect, it, vi } from 'vitest';
import { MAX_UINT256 } from '../abis';
import { production } from '../environments';
import { UnexpectedResponseError } from '../errors';
import type { TransactionHandle } from '../types';
import type { TradingApprovalRequirements } from './approvals';
import {
  resolveIndexedTradingApprovals,
  resolveRpcTradingApprovals,
} from './approvals-state';
import { prepareEoaTradingApprovals } from './approvals-workflow';

const FALSE_RESULT = `0x${'0'.repeat(64)}` as HexString;
const TRUE_RESULT = `0x${'0'.repeat(63)}1` as HexString;
const MAX_UINT256_RESULT = `0x${'f'.repeat(64)}` as HexString;
const wallet = expectEvmAddress('0x0000000000000000000000000000000000000001');

describe('indexed trading approval requirements', () => {
  const { contracts, chainId } = production;
  const required: TradingApprovalRequirements = {
    erc20: [
      {
        tokenAddress: contracts.collateralToken,
        spenderAddress: contracts.standardExchange,
        amount: MAX_UINT256,
      },
      {
        tokenAddress: contracts.collateralToken,
        spenderAddress: contracts.perpsDepositContract,
        amount: MAX_UINT256,
      },
    ],
    erc1155: [
      {
        tokenAddress: contracts.conditionalTokens,
        operatorAddress: contracts.autoRedeemOperator,
      },
    ],
  };

  function snapshot(approved: boolean): ApprovalsSnapshot {
    return {
      address: wallet,
      chainId,
      contracts: [
        ...required.erc20.map(
          (approval): ApprovalContract => ({
            token: approval.tokenAddress,
            spender: approval.spenderAddress,
            standard: ApprovalStandard.Erc20,
            amount: 'max',
            approved,
          }),
        ),
        ...required.erc1155.map(
          (approval): ApprovalContract => ({
            token: approval.tokenAddress,
            spender: approval.operatorAddress,
            standard: ApprovalStandard.Erc1155,
            approved,
          }),
        ),
      ],
    };
  }

  it('does not interpret unapproved persistent max rows as granted', () => {
    const missing = resolveIndexedTradingApprovals(
      snapshot(false),
      wallet,
      chainId,
      required,
    );
    expect(missing).toEqual(required);
    expect(missing.erc20[0]).toBe(required.erc20[0]);
    expect(missing.erc1155[0]).toBe(required.erc1155[0]);
  });

  it('accepts all approved rows including an exact MAX allowance', () => {
    const response = snapshot(true);
    response.contracts[1] = {
      token: contracts.collateralToken,
      spender: contracts.perpsDepositContract,
      standard: ApprovalStandard.Erc20,
      amount: MAX_UINT256,
      approved: true,
    };
    expect(
      resolveIndexedTradingApprovals(response, wallet, chainId, required),
    ).toEqual({
      erc20: [],
      erc1155: [],
    });
  });

  it('keeps the SDK MAX target when a finite allowance is reported approved', () => {
    const response = snapshot(true);
    response.contracts[1] = {
      token: contracts.collateralToken,
      spender: contracts.perpsDepositContract,
      standard: ApprovalStandard.Erc20,
      amount: 1n,
      approved: true,
    };
    expect(
      resolveIndexedTradingApprovals(response, wallet, chainId, required),
    ).toEqual({
      erc20: [required.erc20[1]],
      erc1155: [],
    });
  });

  it('matches addresses case-insensitively, ignores unrelated rows and preserves requirement order', () => {
    const response = snapshot(false);
    response.contracts = response.contracts.reverse().map((row) => ({
      ...row,
      token: expectEvmAddress(row.token.toLowerCase()),
      spender: expectEvmAddress(row.spender.toLowerCase()),
    }));
    response.contracts.push(
      {
        token: contracts.collateralToken,
        spender: wallet,
        standard: ApprovalStandard.Erc20,
        amount: 'max',
        approved: false,
      },
      // A standard the SDK does not evaluate must not affect the result.
      {
        token: contracts.conditionalTokens,
        spender: wallet,
        standard: undefined,
      },
    );
    expect(
      resolveIndexedTradingApprovals(response, wallet, chainId, required),
    ).toEqual(required);
  });

  it.each([
    'owner',
    'chain',
    'missing',
    'duplicate',
    'standard',
    'unknown',
  ] as const)('rejects an unusable snapshot instead of inventing state: %s', (failure) => {
    const response = snapshot(true);
    switch (failure) {
      case 'owner':
        response.address = contracts.collateralToken;
        break;
      case 'chain':
        response.chainId += 1;
        break;
      case 'missing':
        response.contracts.pop();
        break;
      case 'duplicate':
        response.contracts.push(...response.contracts);
        break;
      case 'standard':
        response.contracts[0] = {
          token: contracts.collateralToken,
          spender: contracts.standardExchange,
          standard: ApprovalStandard.Erc1155,
          approved: true,
        };
        break;
      case 'unknown':
        // A required pair whose row failed strict parsing is unusable.
        response.contracts[0] = {
          token: contracts.collateralToken,
          spender: contracts.standardExchange,
          standard: undefined,
        };
        break;
    }
    expect(() =>
      resolveIndexedTradingApprovals(response, wallet, chainId, required),
    ).toThrow(UnexpectedResponseError);
  });
});

describe('RPC trading approval requirements', () => {
  const { contracts } = production;
  const required: TradingApprovalRequirements = {
    erc20: [
      {
        tokenAddress: contracts.collateralToken,
        spenderAddress: contracts.standardExchange,
        amount: MAX_UINT256,
      },
      {
        tokenAddress: contracts.collateralToken,
        spenderAddress: contracts.perpsDepositContract,
        amount: MAX_UINT256,
      },
    ],
    erc1155: [
      {
        tokenAddress: contracts.conditionalTokens,
        operatorAddress: contracts.autoRedeemOperator,
      },
    ],
  };

  it('returns every requirement when allowances and operator approval are missing', () => {
    expect(
      resolveRpcTradingApprovals(
        [FALSE_RESULT, FALSE_RESULT, FALSE_RESULT],
        required,
      ),
    ).toEqual(required);
  });

  it('returns no requirements when all allowances and operator approvals are granted', () => {
    expect(
      resolveRpcTradingApprovals(
        [MAX_UINT256_RESULT, MAX_UINT256_RESULT, TRUE_RESULT],
        required,
      ),
    ).toEqual({ erc20: [], erc1155: [] });
  });

  it('returns only missing approvals in requirement order', () => {
    expect(
      resolveRpcTradingApprovals(
        [MAX_UINT256_RESULT, TRUE_RESULT, FALSE_RESULT],
        required,
      ),
    ).toEqual({ erc20: [required.erc20[1]], erc1155: required.erc1155 });
  });

  it.each([
    { label: 'empty batch', results: [] },
    { label: 'missing allowance', results: [MAX_UINT256_RESULT] },
    {
      label: 'unreadable operator',
      results: [MAX_UINT256_RESULT, MAX_UINT256_RESULT, '0x' as HexString],
    },
  ])('rejects $label results', ({ results }) => {
    expect(() => resolveRpcTradingApprovals(results, required)).toThrow(
      UnexpectedResponseError,
    );
  });
});

describe('EOA trading approval workflow', () => {
  it('confirms each ERC-20 approval before the next approval, then confirms ERC-1155 approvals', async () => {
    const calls = [
      { to: production.contracts.collateralToken, data: '0x01' as HexString },
      { to: production.contracts.collateralToken, data: '0x02' as HexString },
      { to: production.contracts.conditionalTokens, data: '0x03' as HexString },
    ];
    const workflow = prepareEoaTradingApprovals(
      production.chainId,
      calls.slice(0, 2),
      calls.slice(2),
    );
    let step = await workflow.next();
    for (const [index, call] of calls.entries()) {
      expect(step).toEqual({
        done: false,
        value: {
          kind:
            index < 2
              ? 'sendErc20ApprovalTransaction'
              : 'sendErc1155ApprovalForAllTransaction',
          request: { chainId: production.chainId, ...call },
        },
      });
      let confirm: () => void = () => {
        throw new Error('Expected wait to start');
      };
      const confirmation = new Promise<void>((resolve) => {
        confirm = resolve;
      });
      const handle: TransactionHandle = {
        transactionHash: null,
        transactionId: null,
        wait: vi.fn().mockReturnValue(confirmation),
      };
      let advanced = false;
      const next = workflow.next(handle).then((result) => {
        advanced = true;
        return result;
      });
      await vi.waitFor(() =>
        expect(handle.wait).toHaveBeenCalledExactlyOnceWith(),
      );
      expect(advanced).toBe(false);
      confirm();
      step = await next;
    }
    expect(step).toEqual({ done: true, value: undefined });
  });

  it('finishes without requesting a transaction when no approvals are missing', async () => {
    expect(
      await prepareEoaTradingApprovals(production.chainId, [], []).next(),
    ).toEqual({ done: true, value: undefined });
  });
});
