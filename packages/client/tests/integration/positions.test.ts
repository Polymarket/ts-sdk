import {
  type PositionId,
  type TokenId,
  toPositionId,
} from '@polymarket/bindings';
import { ProtocolVersion } from '@polymarket/bindings/gamma';
import type { SecureClient } from '@polymarket/client';
import { type EvmAddress, expectPresent } from '@polymarket/types';
import { vi } from 'vitest';
import {
  decodeErc1155BalanceOfBatchResult,
  erc1155BalanceOfBatchCall,
} from '../../src/abis';
import { describe, expect, it } from './fixtures';
import { findHighVolumeLowPriceMarket } from './markets';

const TEST_SPLIT_AMOUNT = 1_000_000n;
const TEST_COMBO_CONDITION_ID =
  '0x034eabdeca272641d98717d8ca2f8e5f330000000000000000000000000000';
const TEST_COMBO_POSITION_IDS = [
  toPositionId(BigInt(`${TEST_COMBO_CONDITION_ID}00`).toString()),
  toPositionId(BigInt(`${TEST_COMBO_CONDITION_ID}01`).toString()),
];
const TEST_COMBO_LEGS = [
  '920454018917169090762848014984037642864617754825717966757321143422977835520',
  '1012585296795354377868537359137497102116066671623168081060942028909450362880',
];

describe('Positions', { timeout: 600_000 }, () => {
  it('splits and merges complementary positions by condition ID', async ({
    annotate,
    publicClient,
    secureClientWithDepositWallet: secureClient,
  }) => {
    const market = await findHighVolumeLowPriceMarket(publicClient);
    const conditionId = expectPresent(market.conditionId);
    const version = expectPresent(market.version);
    const contracts = secureClient.environment.contracts;
    const tokenAddress =
      version === ProtocolVersion.V2
        ? contracts.positionManager
        : expectPresent(market.state.negRisk)
          ? contracts.negRiskAdapter
          : contracts.conditionalTokens;
    const positionIds =
      version === ProtocolVersion.V2
        ? [
            expectPresent(market.outcomes.yes.positionId),
            expectPresent(market.outcomes.no.positionId),
          ]
        : [
            expectPresent(market.outcomes.yes.tokenId),
            expectPresent(market.outcomes.no.tokenId),
          ];
    const initialBalances = await fetchPositionBalances(
      secureClient,
      tokenAddress,
      positionIds,
    );

    annotate(
      `Wallet: ${secureClient.account.wallet}; condition: ${conditionId}`,
    );
    const split = await secureClient.splitPosition({
      amount: TEST_SPLIT_AMOUNT,
      conditionId,
    });
    annotate(`Split transaction: ${split.transactionId}`);
    await split.wait();

    // Only clean up a confirmed split, and never consume pre-existing holdings.
    try {
      await vi.waitFor(
        async () => {
          await expect(
            fetchPositionBalances(secureClient, tokenAddress, positionIds),
          ).resolves.toEqual(
            initialBalances.map((balance) => balance + TEST_SPLIT_AMOUNT),
          );
        },
        { timeout: 20_000 },
      );
    } finally {
      const merge = await secureClient.mergePositions({
        amount: TEST_SPLIT_AMOUNT,
        conditionId,
      });
      annotate(`Merge transaction: ${merge.transactionId}`);
      await merge.wait();

      await vi.waitFor(
        async () => {
          await expect(
            fetchPositionBalances(secureClient, tokenAddress, positionIds),
          ).resolves.toEqual(initialBalances);
        },
        { timeout: 20_000 },
      );
    }
  });

  it('splits and merges complementary combo positions by legs', async ({
    annotate,
    secureClientWithDepositWallet: secureClient,
  }) => {
    const tokenAddress = secureClient.environment.contracts.positionManager;
    const initialBalances = await fetchPositionBalances(
      secureClient,
      tokenAddress,
      TEST_COMBO_POSITION_IDS,
    );

    annotate(
      `Wallet: ${secureClient.account.wallet}; condition: ${TEST_COMBO_CONDITION_ID}`,
    );
    const split = await secureClient.splitPosition({
      amount: TEST_SPLIT_AMOUNT,
      legs: TEST_COMBO_LEGS,
    });
    annotate(`Split transaction: ${split.transactionId}`);
    await split.wait();

    try {
      await vi.waitFor(
        async () => {
          await expect(
            fetchPositionBalances(
              secureClient,
              tokenAddress,
              TEST_COMBO_POSITION_IDS,
            ),
          ).resolves.toEqual(
            initialBalances.map((balance) => balance + TEST_SPLIT_AMOUNT),
          );
        },
        { timeout: 20_000 },
      );
    } finally {
      const merge = await secureClient.mergePositions({
        amount: TEST_SPLIT_AMOUNT,
        legs: TEST_COMBO_LEGS,
      });
      annotate(`Merge transaction: ${merge.transactionId}`);
      await merge.wait();

      await vi.waitFor(
        async () => {
          await expect(
            fetchPositionBalances(
              secureClient,
              tokenAddress,
              TEST_COMBO_POSITION_IDS,
            ),
          ).resolves.toEqual(initialBalances);
        },
        { timeout: 20_000 },
      );
    }
  });
});

async function fetchPositionBalances(
  client: SecureClient,
  tokenAddress: EvmAddress,
  positionIds: readonly (PositionId | TokenId)[],
): Promise<readonly bigint[]> {
  const balances = decodeErc1155BalanceOfBatchResult(
    await client.rpc.ethCall(
      erc1155BalanceOfBatchCall(
        tokenAddress,
        client.account.wallet,
        positionIds,
      ),
    ),
  );
  expect(balances).toHaveLength(2);
  return balances;
}
