import {
  ActivityType,
  createSecureClient,
  decodePositionId,
  deriveDirectionalBucketPositions,
  deriveDirectionalThresholdPositions,
  type PositionId,
  production,
  relayerApiKey,
  type SecureClient,
  UserInputError,
  WalletType,
} from '@polymarket/client';
import { privateKey } from '@polymarket/client/viem';
import { http } from 'viem';
import { polygon } from 'viem/chains';
import { vi } from 'vitest';
import {
  decodeErc20BalanceOfResult,
  decodeErc1155BalanceOfBatchResult,
  erc20BalanceOfCall,
  erc1155BalanceOfBatchCall,
} from '../../src/abis';
import { describe, expect, it } from './fixtures';

const amount = 1_000_000n;
const eventId = process.env.POLYMARKET_DCR_EVENT_ID;
const lowLine = 1;
const highLine = 2;

// One pair requires at least three buckets. Use dedicated funded staging wallets.
describe('Directional staging round trip', () => {
  for (const walletType of [
    WalletType.DEPOSIT_WALLET,
    WalletType.GNOSIS_SAFE,
    WalletType.EOA,
  ]) {
    it(`merges and reverses a pair with ${walletType}`, {
      timeout: 600_000,
    }, async ({ environment, skip, annotate }) => {
      if (!eventId)
        return skip(
          'POLYMARKET_DCR_EVENT_ID is not set; staging transactions were not tested',
        );
      if (
        environment.name === production.name ||
        environment.rpc === production.rpc
      ) {
        throw new Error(
          'Directional lifecycle tests require an explicit staging environment and RPC',
        );
      }
      const keyName =
        walletType === WalletType.EOA
          ? 'POLYMARKET_DCR_EOA_PRIVATE_KEY'
          : walletType === WalletType.GNOSIS_SAFE
            ? 'POLYMARKET_SAFE_PRIVATE_KEY'
            : 'POLYMARKET_PRIVATE_KEY';
      const walletName =
        walletType === WalletType.GNOSIS_SAFE
          ? 'POLYMARKET_SAFE_WALLET'
          : 'POLYMARKET_DEPOSIT_WALLET';
      const key = process.env[keyName];
      const wallet =
        walletType === WalletType.EOA ? undefined : process.env[walletName];
      if (!key || (walletType !== WalletType.EOA && !wallet))
        return skip(`Missing staging credentials for ${walletType}`);
      const relayerKey = process.env.POLYMARKET_RELAYER_API_KEY;
      const relayerAddress = process.env.POLYMARKET_RELAYER_API_KEY_ADDRESS;
      if (walletType !== WalletType.EOA && (!relayerKey || !relayerAddress))
        return skip('Missing staging relayer authorization');

      const client = await createSecureClient({
        environment,
        wallet,
        signer: privateKey(key, {
          chain: { ...polygon, id: environment.chainId },
          transport: http(environment.rpc),
        }),
        apiKey:
          relayerKey && relayerAddress
            ? relayerApiKey({ key: relayerKey, address: relayerAddress })
            : undefined,
      });
      expect(client.account.walletType).toBe(walletType);
      const low = deriveDirectionalThresholdPositions({
        eventId,
        line: lowLine,
      });
      const high = deriveDirectionalThresholdPositions({
        eventId,
        line: highLine,
      });
      const middle = deriveDirectionalBucketPositions({
        eventId,
        bucketIndex: lowLine,
      });
      const decoded = decodePositionId(low.abovePositionId);
      const voidPosition = deriveDirectionalBucketPositions({
        eventId,
        bucketIndex: decoded.bucketCount,
      });
      const ids = [
        low.abovePositionId,
        low.belowPositionId,
        high.abovePositionId,
        high.belowPositionId,
        middle.yesPositionId,
        voidPosition.yesPositionId,
      ];
      const baseline = await balances(client, ids);
      // Maximum-amount operations must not consume any existing inventory.
      expect(baseline.positions).toEqual(ids.map(() => 0n));
      expect(baseline.collateral).toBeGreaterThanOrEqual(2n * amount);

      await expect(
        client.mergeDirectional({
          eventId,
          lowLine: highLine,
          highLine: lowLine,
        }),
      ).rejects.toBeInstanceOf(UserInputError);
      await client.setupTradingApprovals();
      // Deterministic inventory setup isolates Router and wallet execution from order-book availability.
      await (
        await client.splitPosition({ conditionId: low.conditionId, amount })
      ).wait();
      await (
        await client.splitPosition({ conditionId: high.conditionId, amount })
      ).wait();
      const pair = { eventId, lowLine, highLine };
      const merge = await client.mergeDirectional(pair);
      const outcome = await merge.wait();
      annotate(
        `DCR merge: ${outcome.transactionHash}; wallet: ${client.account.wallet}`,
      );
      const errors: unknown[] = [];
      try {
        expect(await balances(client, ids)).toEqual({
          collateral: baseline.collateral - amount,
          positions: [0n, amount, amount, 0n, amount, 0n],
        });
        await vi.waitFor(
          async () => {
            const page = await client
              .listActivity({
                user: client.account.wallet,
                type: [ActivityType.DIRECTIONAL_MERGE],
              })
              .firstPage();
            const rows = page.items.filter(
              (row) => row.transactionHash === outcome.transactionHash,
            );
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({
              type: ActivityType.DIRECTIONAL_MERGE,
              eventId: decoded.eventId,
              amount: '1',
              pairs: '1',
            });
          },
          { timeout: 30_000, interval: 1_000 },
        );
        const holdings = await client
          .listPositions({
            user: client.account.wallet,
            conditionId: middle.conditionId,
          })
          .firstPage();
        expect(
          holdings.items.some(
            (position) => position.assetId === middle.yesPositionId,
          ),
        ).toBe(true);
        const metadata = await client
          .listMarkets({ positionIds: [middle.yesPositionId], closed: 'any' })
          .firstPage();
        expect(
          metadata.items.some((market) =>
            market.conditionId?.startsWith(middle.conditionId),
          ),
        ).toBe(true);
      } catch (error) {
        errors.push(error);
      }
      // Only reverse a confirmed merge. Explicit amounts keep cleanup bounded to this test's inventory.
      await (await client.splitDirectional(pair)).wait();
      expect(await balances(client, ids)).toEqual({
        collateral: baseline.collateral - 2n * amount,
        positions: [amount, amount, amount, amount, 0n, 0n],
      });
      await (
        await client.mergePositions({ conditionId: low.conditionId, amount })
      ).wait();
      await (
        await client.mergePositions({ conditionId: high.conditionId, amount })
      ).wait();
      expect(await balances(client, ids)).toEqual(baseline);
      if (errors.length)
        throw new AggregateError(
          errors,
          'Directional indexing or balance verification failed',
        );
    });
  }
});

async function balances(client: SecureClient, ids: readonly PositionId[]) {
  const [collateral, positions] = await client.rpc.ethCallBatch([
    erc20BalanceOfCall(
      client.environment.contracts.collateralToken,
      client.account.wallet,
    ),
    erc1155BalanceOfBatchCall(
      client.environment.contracts.positionManager,
      client.account.wallet,
      ids,
    ),
  ]);
  if (collateral === undefined || positions === undefined)
    throw new Error('Missing balance result');
  return {
    collateral: decodeErc20BalanceOfResult(collateral),
    positions: decodeErc1155BalanceOfBatchResult(positions),
  };
}
