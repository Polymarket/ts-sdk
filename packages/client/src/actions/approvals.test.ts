import {
  type ApprovalContract,
  ApprovalStandard,
  type ApprovalsSnapshot,
} from '@polymarket/bindings/data';
import { WalletType } from '@polymarket/bindings/gamma';
import {
  expectEvmAddress,
  expectTxHash,
  type HexString,
} from '@polymarket/types';
import { describe, expect, it, vi } from 'vitest';
import {
  erc20ApprovalCall,
  erc1155ApprovalForAllCall,
  MAX_UINT256,
} from '../abis';
import type { BaseSecureClient } from '../clients';
import { production } from '../environments';
import { UnexpectedResponseError } from '../errors';
import type { EthCallRequest } from '../rpc';
import type { TransactionHandle } from '../types';
import { SignerType } from '../wallet';
import {
  prepareTradingApprovals,
  type TradingApprovalRequirements,
} from './approvals';
import { resolveIndexedTradingApprovals } from './approvals-state';

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

describe('prepareTradingApprovals', () => {
  it('submits every missing approval and waits after each EOA transaction', async () => {
    const { client } = createClient([
      ...Array<HexString>(7).fill(FALSE_RESULT),
      ...Array<HexString>(10).fill(FALSE_RESULT),
    ]);
    const workflow = await prepareTradingApprovals(client);
    const handles = Array.from({ length: 17 }, createTransactionHandle);
    let result = await workflow.next();

    for (const handle of handles) {
      expect(result.done).toBe(false);
      result = await workflow.next(handle);
    }

    expect(result).toEqual({
      done: true,
      value: undefined,
    });
    for (const handle of handles) {
      expect(handle.wait).toHaveBeenCalledTimes(1);
    }
  });

  it('completes without transactions when approvals are already set', async () => {
    const { client, ethCallBatch } = createClient([
      ...Array<HexString>(7).fill(MAX_UINT256_RESULT),
      ...Array<HexString>(10).fill(TRUE_RESULT),
    ]);

    const workflow = await prepareTradingApprovals(client);

    const result = await workflow.next();

    expect(result).toEqual({
      done: true,
      value: undefined,
    });
    expect(ethCallBatch).toHaveBeenCalledTimes(1);
    expect(ethCallBatch.mock.calls[0]?.[0]).toHaveLength(17);
  });

  it('submits only missing approvals', async () => {
    const { client } = createClient([
      ...Array<HexString>(6).fill(MAX_UINT256_RESULT),
      FALSE_RESULT,
      ...Array<HexString>(5).fill(TRUE_RESULT),
      FALSE_RESULT,
      FALSE_RESULT,
      ...Array<HexString>(3).fill(TRUE_RESULT),
    ]);
    const firstHandle = createTransactionHandle();
    const secondHandle = createTransactionHandle();
    const thirdHandle = createTransactionHandle();
    const workflow = await prepareTradingApprovals(client);

    let result = await workflow.next();

    expect(result).toEqual({
      done: false,
      value: {
        kind: 'sendErc20ApprovalTransaction',
        request: {
          chainId: production.chainId,
          ...erc20ApprovalCall(
            production.contracts.collateralToken,
            production.contracts.perpsDepositContract,
            MAX_UINT256,
          ),
        },
      },
    });

    result = await workflow.next(firstHandle);

    expect(result).toEqual({
      done: false,
      value: {
        kind: 'sendErc1155ApprovalForAllTransaction',
        request: {
          chainId: production.chainId,
          ...erc1155ApprovalForAllCall(
            production.contracts.conditionalTokens,
            production.contracts.binaryModule,
            true,
          ),
        },
      },
    });

    result = await workflow.next(secondHandle);

    expect(result).toEqual({
      done: false,
      value: {
        kind: 'sendErc1155ApprovalForAllTransaction',
        request: {
          chainId: production.chainId,
          ...erc1155ApprovalForAllCall(
            production.contracts.conditionalTokens,
            production.contracts.negRiskModule,
            true,
          ),
        },
      },
    });

    result = await workflow.next(thirdHandle);

    expect(result).toEqual({
      done: true,
      value: undefined,
    });
    expect(firstHandle.wait).toHaveBeenCalledTimes(1);
    expect(secondHandle.wait).toHaveBeenCalledTimes(1);
    expect(thirdHandle.wait).toHaveBeenCalledTimes(1);
  });
});

function createClient(results: HexString[]) {
  const ethCallBatch = vi.fn(
    async (_calls: readonly EthCallRequest[]): Promise<HexString[]> => results,
  );
  const client = {
    account: {
      signerType: SignerType.OWNER,
      wallet,
      walletType: WalletType.EOA,
    },
    environment: production,
    rpc: { ethCallBatch },
  } as unknown as BaseSecureClient;

  return { client, ethCallBatch };
}

function createTransactionHandle(): TransactionHandle {
  return {
    transactionHash: null,
    transactionId: null,
    wait: vi.fn(async () => ({
      transactionHash: expectTxHash(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
      ),
      transactionId: null,
    })),
  };
}
