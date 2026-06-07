import {
  createSecureClient,
  preproduction,
  type SecureClient,
} from '@polymarket/client';
import { expectPresent } from '@polymarket/types';
import { vi } from 'vitest';
import { describe, expect, it, publicClient } from './fixtures';
import { findHighVolumeLowPriceMarket } from './markets';

const TEST_COMBO_AMOUNT = 1_000_000n;
const TEST_COMBO_CONDITION_ID =
  '0x034eabdeca272641d98717d8ca2f8e5f330000000000000000000000000000';
const TEST_COMBO_LEGS = [
  '920454018917169090762848014984037642864617754825717966757321143422977835520',
  '1012585296795354377868537359137497102116066671623168081060942028909450362880',
];
const conditionId = expectPresent(
  (await findHighVolumeLowPriceMarket(publicClient)).conditionId,
);

describe('Positions', () => {
  describe('and a CLOB market', () => {
    it('splits a position by condition ID', async ({
      depositWalletAddress,
      depositWalletSigner,
      relayerAuthentication,
    }) => {
      const secureClient = await createSecureClient({
        apiKey: relayerAuthentication,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });

      await secureClient
        .splitPosition({
          amount: 1_000_000n,
          conditionId,
        })
        .then((handle) => handle.wait());

      await vi.waitFor(
        async () => {
          const positions = await secureClient
            .listPositions({
              user: secureClient.account.wallet,
              market: [conditionId],
            })
            .firstPage();
          expect(positions.items).toHaveLength(2);
        },
        { timeout: 15_000 },
      );
    });

    it('merges complementary positions by condition ID', async ({
      depositWalletAddress,
      depositWalletSigner,
      relayerAuthentication,
      skip,
    }) => {
      const secureClient = await createSecureClient({
        apiKey: relayerAuthentication,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });

      const { items: positions } = await secureClient
        .listPositions({
          user: secureClient.account.wallet,
          market: [conditionId],
        })
        .firstPage();

      if (positions.length < 2) {
        skip('Not enough positions to merge');
      }

      await secureClient
        .mergePositions({
          amount: 'max',
          conditionId,
        })
        .then((handle) => handle.wait());

      await vi.waitFor(
        async () => {
          const positions = await secureClient
            .listPositions({
              user: secureClient.account.wallet,
              market: [conditionId],
            })
            .firstPage();
          expect(positions.items).toHaveLength(0);
        },
        { timeout: 15_000 },
      );
    });
  });

  describe('and a Combo', () => {
    it('splits a combo position by legs', async ({
      depositWalletAddress,
      depositWalletSigner,
      relayerAuthentication,
    }) => {
      const secureClient = await createSecureClient({
        apiKey: relayerAuthentication,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
        environment: preproduction,
      });

      const initialShares = await fetchComboShares(secureClient);

      await secureClient
        .splitPosition({
          amount: TEST_COMBO_AMOUNT,
          legs: TEST_COMBO_LEGS,
        })
        .then((handle) => handle.wait());

      await vi.waitFor(
        async () => {
          await expect(fetchComboShares(secureClient)).resolves.toBeGreaterThan(
            initialShares,
          );
        },
        { timeout: 15_000 },
      );
    });

    it('merges a combo position by legs', async ({
      depositWalletAddress,
      depositWalletSigner,
      relayerAuthentication,
      skip,
    }) => {
      const secureClient = await createSecureClient({
        apiKey: relayerAuthentication,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
        environment: preproduction,
      });

      const initialShares = await fetchComboShares(secureClient);

      if (initialShares === 0) {
        skip('No combo position to merge');
      }

      await secureClient
        .mergePositions({
          amount: 'max',
          legs: TEST_COMBO_LEGS,
        })
        .then((handle) => handle.wait());

      await vi.waitFor(
        async () => {
          await expect(fetchComboShares(secureClient)).resolves.toBeLessThan(
            initialShares,
          );
        },
        { timeout: 15_000 },
      );
    });
  });
});

async function fetchComboShares(client: SecureClient): Promise<number> {
  const page = await client
    .listComboPositions({
      conditionId: TEST_COMBO_CONDITION_ID,
      pageSize: 5,
    })
    .firstPage();
  const combo = page.items.find(
    (position) => String(position.conditionId) === TEST_COMBO_CONDITION_ID,
  );

  if (combo === undefined) {
    return 0;
  }

  const shares = Number(combo.shares);

  expect(Number.isFinite(shares)).toBe(true);

  return shares;
}
