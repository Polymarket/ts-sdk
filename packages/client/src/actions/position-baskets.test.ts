import type { PositionId } from '@polymarket/bindings';
import {
  DirectionalEventIdSchema,
  decodeDirectionalPositionId,
  ThresholdSide,
} from '@polymarket/bindings/protocol';
import { describe, expect, it } from 'vitest';
import { RequestRejectedError, UnexpectedResponseError } from '../errors';
import {
  bucketRangePositionIds,
  eventYesPositionIds,
  readPositionBalances,
  resolveAvailableAmount,
  thresholdBasketPositionIds,
} from './position-baskets';

// Four real buckets; the Void bucket has index 4.
const EVENT_ID = DirectionalEventIdSchema.parse(
  '0x0400112233445566778899aabbccddeeff000400000000000000000102',
);

function bucketIndices(positionIds: readonly PositionId[]): number[] {
  return positionIds.map(
    (positionId) => decodeDirectionalPositionId(positionId).conditionIndex,
  );
}

describe('position baskets', () => {
  it('caps directional splits by collateral as well as every middle bucket', () => {
    const assets = [
      { asset: 'bucket 1', balance: 3_000_000n },
      { asset: 'bucket 2', balance: 2_000_000n },
      { asset: 'pUSD', balance: 500_000n },
    ];
    expect(resolveAvailableAmount(assets, 'max')).toBe(500_000n);
    expect(resolveAvailableAmount(assets, 400_000n)).toBe(400_000n);
    expect(() => resolveAvailableAmount(assets, 1_000_000n)).toThrow(/pUSD/);
    assets[2] = { asset: 'pUSD', balance: 4_000_000n };
    expect(resolveAvailableAmount(assets, 'max')).toBe(2_000_000n);
    assets[1] = { asset: 'bucket 2', balance: 0n };
    expect(() => resolveAvailableAmount(assets, 'max')).toThrow(/bucket 2/);
  });
  it('includes Void only in the event set and BELOW baskets', () => {
    expect(bucketIndices(eventYesPositionIds(EVENT_ID))).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(
      bucketIndices(
        thresholdBasketPositionIds(EVENT_ID, 2, ThresholdSide.Above),
      ),
    ).toEqual([2, 3]);
    expect(
      bucketIndices(
        thresholdBasketPositionIds(EVENT_ID, 2, ThresholdSide.Below),
      ),
    ).toEqual([0, 1, 4]);
    expect(bucketIndices(bucketRangePositionIds(EVENT_ID, 1, 3))).toEqual([
      1, 2,
    ]);
  });
});

describe('wide basket balances', () => {
  const wideEventId = DirectionalEventIdSchema.parse(
    '0x0400112233445566778899aabbccddeeff138a00000000000000000000',
  );
  const positionIds = bucketRangePositionIds(wideEventId, 1, 5001);

  it('prepares a 5,000-bucket basket without exceeding the RPC position limit', async () => {
    const readIds: PositionId[] = [];
    const balances = await readPositionBalances(positionIds, async (chunk) => {
      if (chunk.length > 200) {
        throw new RequestRejectedError('RPC payload too large', {
          status: 413,
        });
      }
      readIds.push(...chunk);
      return chunk.map((id) => (id === positionIds[4250] ? 3n : 10n));
    });

    expect(readIds).toEqual(positionIds);
    expect(
      resolveAvailableAmount(
        balances.map((balance, index) => ({
          asset: positionIds[index] ?? '',
          balance,
        })),
        'max',
      ),
    ).toBe(3n);
  });

  it('checks the last chunk and collateral when resolving explicit and maximum amounts', async () => {
    const balances = await readPositionBalances(
      positionIds.slice(0, 401),
      async (chunk) => chunk.map((id) => (id === positionIds[400] ? 4n : 10n)),
    );
    const assets = balances.map((balance, index) => ({
      asset: positionIds[index] ?? '',
      balance,
    }));
    expect(() => resolveAvailableAmount(assets, 5n)).toThrow(positionIds[400]);
    expect(
      resolveAvailableAmount(
        [...assets, { asset: 'pUSD', balance: 2n }],
        'max',
      ),
    ).toBe(2n);
  });

  it('rejects a missing balance in a later chunk instead of using a partial basket', async () => {
    await expect(
      readPositionBalances(positionIds.slice(0, 201), async (chunk) =>
        chunk.length === 200 ? chunk.map(() => 10n) : [],
      ),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it('propagates a later read failure instead of resolving a partial amount', async () => {
    const error = new RequestRejectedError('RPC unavailable', { status: 503 });
    await expect(
      readPositionBalances(positionIds.slice(0, 201), async (chunk) => {
        if (chunk.length < 200) throw error;
        return chunk.map(() => 10n);
      }),
    ).rejects.toBe(error);
  });
});
