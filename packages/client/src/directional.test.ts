import { describe, expect, it } from 'vitest';
import {
  directionalPairsFromHoldings,
  directionalSplitPairsFromHoldings,
} from './actions/directional-pairs';
import {
  decodePositionId,
  deriveDirectionalBucketPositions,
  deriveDirectionalThresholdPositions,
} from './directional';
import { UserInputError } from './errors';
import { isV2PositionId } from './protocol';

// Ids.sol layout: module, base hash, bucket count, reserved (zero), resolution chain.
const EVENT = '0x0400112233445566778899aabbccddeeff000400000000000000000102';

describe('directional position derivation', () => {
  it('finds only same-event ABOVE-low / BELOW-high pairs and sizes each independently', () => {
    const low = deriveDirectionalThresholdPositions({
      eventId: EVENT,
      line: 1,
    });
    const high = deriveDirectionalThresholdPositions({
      eventId: EVENT,
      line: 3,
    });
    const otherEvent = `0x040111${EVENT.slice(8)}`;
    const other = deriveDirectionalThresholdPositions({
      eventId: otherEvent,
      line: 3,
    });
    const bucket = deriveDirectionalBucketPositions({
      eventId: EVENT,
      bucketIndex: 2,
    });
    const pairs = directionalPairsFromHoldings([
      { positionId: low.abovePositionId, balance: 2_000_000n },
      { positionId: low.belowPositionId, balance: 9_000_000n },
      { positionId: high.abovePositionId, balance: 9_000_000n },
      { positionId: high.belowPositionId, balance: 1_000_000n },
      { positionId: other.belowPositionId, balance: 9_000_000n },
      { positionId: bucket.yesPositionId, balance: 9_000_000n },
    ]);
    expect(pairs).toEqual([
      {
        eventId: EVENT,
        lowLine: 1,
        highLine: 3,
        abovePositionId: low.abovePositionId,
        belowPositionId: high.belowPositionId,
        amount: 1_000_000n,
        expectedPusd: 1_000_000n,
      },
    ]);
  });

  it('ranks merge candidates by returned collateral rather than holdings order', () => {
    const low = deriveDirectionalThresholdPositions({
      eventId: EVENT,
      line: 1,
    });
    const middle = deriveDirectionalThresholdPositions({
      eventId: EVENT,
      line: 2,
    });
    const high = deriveDirectionalThresholdPositions({
      eventId: EVENT,
      line: 3,
    });
    const pairs = directionalPairsFromHoldings([
      { positionId: low.abovePositionId, balance: 8n },
      { positionId: middle.belowPositionId, balance: 2n },
      { positionId: high.belowPositionId, balance: 6n },
    ]);
    expect(
      pairs.map(({ highLine, expectedPusd }) => ({ highLine, expectedPusd })),
    ).toEqual([
      { highLine: 3, expectedPusd: 6n },
      { highLine: 2, expectedPusd: 2n },
    ]);
  });

  it('selects the widest best-amount split and rediscovers from remaining inventory', () => {
    const bucket1 = deriveDirectionalBucketPositions({
      eventId: EVENT,
      bucketIndex: 1,
    });
    const bucket2 = deriveDirectionalBucketPositions({
      eventId: EVENT,
      bucketIndex: 2,
    });
    const low = deriveDirectionalThresholdPositions({
      eventId: EVENT,
      line: 1,
    });
    const high = deriveDirectionalThresholdPositions({
      eventId: EVENT,
      line: 3,
    });
    const holdings = [
      { positionId: bucket2.yesPositionId, balance: 7n },
      { positionId: bucket1.yesPositionId, balance: 10n },
    ];
    const pairs = directionalSplitPairsFromHoldings(holdings, 5n);
    expect(
      pairs.map(({ lowLine, highLine, amount }) => ({
        lowLine,
        highLine,
        amount,
      })),
    ).toEqual([{ lowLine: 1, highLine: 3, amount: 5n }]);
    expect(pairs[0]).toMatchObject({
      eventId: EVENT,
      abovePositionId: low.abovePositionId,
      belowPositionId: high.belowPositionId,
    });
    expect(
      directionalSplitPairsFromHoldings(holdings, 20n).map(
        (pair) => pair.amount,
      ),
    ).toEqual([10n]);
    const remaining = directionalSplitPairsFromHoldings(
      [
        { positionId: bucket1.yesPositionId, balance: 0n },
        { positionId: bucket2.yesPositionId, balance: 7n },
      ],
      10n,
    );
    expect(remaining).toMatchObject([{ lowLine: 2, highLine: 3, amount: 7n }]);
    expect(directionalSplitPairsFromHoldings(holdings, 0n)).toEqual([]);
  });

  it('does not bridge missing or zero-balance buckets when discovering split ranges', () => {
    const largerEvent = EVENT.replace('0004', '0006');
    const bucket1 = deriveDirectionalBucketPositions({
      eventId: largerEvent,
      bucketIndex: 1,
    });
    const bucket2 = deriveDirectionalBucketPositions({
      eventId: largerEvent,
      bucketIndex: 2,
    });
    const bucket3 = deriveDirectionalBucketPositions({
      eventId: largerEvent,
      bucketIndex: 3,
    });
    const holdings = [
      { positionId: bucket1.yesPositionId, balance: 4n },
      { positionId: bucket3.yesPositionId, balance: 6n },
    ];
    const expected = [{ lowLine: 3, highLine: 4, amount: 6n }];
    for (const positions of [
      holdings,
      [...holdings, { positionId: bucket2.yesPositionId, balance: 0n }],
    ]) {
      expect(
        directionalSplitPairsFromHoldings(positions, 20n).map(
          ({ lowLine, highLine, amount }) => ({ lowLine, highLine, amount }),
        ),
      ).toEqual(expected);
    }
  });

  it('ignores bucket NO, lines, Void and outer buckets when discovering splits', () => {
    const bucket0 = deriveDirectionalBucketPositions({
      eventId: EVENT,
      bucketIndex: 0,
    });
    const bucket1 = deriveDirectionalBucketPositions({
      eventId: EVENT,
      bucketIndex: 1,
    });
    const bucket3 = deriveDirectionalBucketPositions({
      eventId: EVENT,
      bucketIndex: 3,
    });
    const voidPosition = deriveDirectionalBucketPositions({
      eventId: EVENT,
      bucketIndex: 4,
    });
    const line = deriveDirectionalThresholdPositions({
      eventId: EVENT,
      line: 1,
    });
    const pairs = directionalSplitPairsFromHoldings(
      [
        { positionId: bucket0.yesPositionId, balance: 50n },
        { positionId: bucket1.noPositionId, balance: 50n },
        { positionId: bucket3.yesPositionId, balance: 50n },
        { positionId: voidPosition.yesPositionId, balance: 50n },
        { positionId: line.abovePositionId, balance: 50n },
      ],
      50n,
    );
    expect(pairs).toEqual([]);
  });

  it('keeps split ranges within their event and breaks equal candidate ties deterministically', () => {
    const otherEvent = `0x040111${EVENT.slice(8)}`;
    const first = deriveDirectionalBucketPositions({
      eventId: EVENT,
      bucketIndex: 1,
    });
    const second = deriveDirectionalBucketPositions({
      eventId: otherEvent,
      bucketIndex: 2,
    });
    const holdings = [
      { positionId: second.yesPositionId, balance: 5n },
      { positionId: first.yesPositionId, balance: 5n },
    ];
    const pairs = directionalSplitPairsFromHoldings(holdings, 8n);
    expect(
      pairs.map(({ eventId, lowLine, highLine }) => ({
        eventId,
        lowLine,
        highLine,
      })),
    ).toEqual([{ eventId: EVENT, lowLine: 1, highLine: 2 }]);
    expect(
      directionalSplitPairsFromHoldings([...holdings].reverse(), 8n),
    ).toEqual(pairs);
  });

  it('selects the same split as exhaustive ranking for varying, gapped, and capped balances', () => {
    for (const balances of [
      [4n, 4n, 4n],
      [9n, 1n, 9n],
      [0n, 4n, 4n, 0n, 7n],
      [2n, 0n, 2n, 2n],
      [0n, 0n],
    ]) {
      const eventId = EVENT.replace(
        '0004',
        (balances.length + 2).toString(16).padStart(4, '0'),
      );
      const holdings = balances.map((balance, index) => ({
        positionId: deriveDirectionalBucketPositions({
          eventId,
          bucketIndex: index + 1,
        }).yesPositionId,
        balance,
      }));
      for (const collateral of [0n, 1n, 3n, 20n]) {
        const reference: {
          lowLine: number;
          highLine: number;
          amount: bigint;
        }[] = [];
        for (let start = 0; start < balances.length; start++) {
          let amount = collateral;
          for (let end = start; end < balances.length; end++) {
            const balance = balances[end] ?? 0n;
            if (balance < amount) amount = balance;
            if (amount <= 0n) break;
            reference.push({ lowLine: start + 1, highLine: end + 2, amount });
          }
        }
        reference.sort((a, b) => {
          if (a.amount !== b.amount) return a.amount > b.amount ? -1 : 1;
          return (
            b.highLine - b.lowLine - (a.highLine - a.lowLine) ||
            a.lowLine - b.lowLine
          );
        });
        expect(
          directionalSplitPairsFromHoldings(holdings, collateral).map(
            ({ lowLine, highLine, amount }) => ({ lowLine, highLine, amount }),
          ),
        ).toEqual(reference.slice(0, 1));
      }
    }
  });

  it('selects a best split for a large ladder without materializing every subrange', () => {
    const bucketCount = 5_002;
    const eventId = EVENT.replace(
      '0004',
      bucketCount.toString(16).padStart(4, '0'),
    );
    const holdings = Array.from({ length: bucketCount - 2 }, (_, index) => ({
      positionId: deriveDirectionalBucketPositions({
        eventId,
        bucketIndex: index + 1,
      }).yesPositionId,
      balance: 10n,
    }));
    const pairs = directionalSplitPairsFromHoldings(holdings, 3n);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ lowLine: 1, highLine: 5_001, amount: 3n });
  });
  it('decodes usable line indices and economic sides, including Void', () => {
    const low = deriveDirectionalThresholdPositions({
      eventId: EVENT,
      line: 1,
    });
    const high = deriveDirectionalThresholdPositions({
      eventId: EVENT,
      line: 3,
    });
    expect(decodePositionId(low.abovePositionId)).toMatchObject({
      moduleId: 4,
      eventId: EVENT,
      bucketCount: 4,
      kind: 'line',
      index: 1,
      side: 'above',
    });
    expect(decodePositionId(high.belowPositionId)).toMatchObject({
      kind: 'line',
      index: 3,
      side: 'below',
    });
    for (const [bucketIndex, kind] of [
      [2, 'bucket'],
      [4, 'void'],
    ] as const) {
      const bucket = deriveDirectionalBucketPositions({
        eventId: EVENT,
        bucketIndex,
      });
      expect(decodePositionId(bucket.noPositionId)).toMatchObject({
        kind,
        index: bucketIndex,
        side: 'no',
      });
    }
    expect(() => decodePositionId('123')).toThrow(UserInputError);
  });
  it('returns complementary Void positions and preserves the complete event identity', () => {
    const positions = deriveDirectionalBucketPositions({
      eventId: `${EVENT.toUpperCase().replace('0X', '0x')}000000`,
      bucketIndex: 4,
    });
    expect(positions).toEqual({
      conditionId: `${EVENT}0004`,
      yesPositionId: BigInt(`${EVENT}000400`).toString(),
      noPositionId: BigInt(`${EVENT}000401`).toString(),
    });
    expect(() =>
      deriveDirectionalBucketPositions({ eventId: EVENT, bucketIndex: 5 }),
    ).toThrow(/bucketIndex/);
  });

  it('returns ABOVE and BELOW without exposing the threshold flag as a consumer input', () => {
    expect(
      deriveDirectionalThresholdPositions({ eventId: EVENT, line: 2 }),
    ).toEqual({
      conditionId: `${EVENT}8002`,
      abovePositionId: BigInt(`${EVENT}800200`).toString(),
      belowPositionId: BigInt(`${EVENT}800201`).toString(),
    });
    for (const line of [0, 4, 0x8002]) {
      expect(() =>
        deriveDirectionalThresholdPositions({ eventId: EVENT, line }),
      ).toThrow(/line/);
    }
  });

  it('rejects non-directional roots, non-zero reserved bits, and dirty suffixes', () => {
    for (const eventId of [
      `0x02${EVENT.slice(4)}`,
      `${EVENT.slice(0, 40)}0000000000000001${EVENT.slice(56)}`,
      `${EVENT}000001`,
      `${EVENT}800200`,
    ]) {
      expect(() =>
        deriveDirectionalBucketPositions({ eventId, bucketIndex: 0 }),
      ).toThrow(UserInputError);
      expect(() =>
        deriveDirectionalThresholdPositions({ eventId, line: 1 }),
      ).toThrow(UserInputError);
    }
  });

  it('derives IDs that order routing classifies as V2', () => {
    const bucket = deriveDirectionalBucketPositions({
      eventId: EVENT,
      bucketIndex: 4,
    });
    const threshold = deriveDirectionalThresholdPositions({
      eventId: EVENT,
      line: 2,
    });
    for (const positionId of [
      bucket.yesPositionId,
      bucket.noPositionId,
      threshold.abovePositionId,
      threshold.belowPositionId,
    ]) {
      expect(isV2PositionId(positionId)).toBe(true);
    }
  });
});
