import { expectTxHash } from '@polymarket/types';
import { describe, expect, it } from 'vitest';
import { deriveDirectionalThresholdPositions } from '../directional';
import { executeDirectionalPairs } from './directional-bulk';

const eventId = '0x0400112233445566778899aabbccddeeff000400000000000000000000';
const { abovePositionId } = deriveDirectionalThresholdPositions({
  eventId,
  line: 1,
});
const { belowPositionId } = deriveDirectionalThresholdPositions({
  eventId,
  line: 3,
});
const outcome = {
  transactionHash: expectTxHash(`0x${'ab'.repeat(32)}`),
  transactionId: null,
};

describe('directional bulk execution', () => {
  it('rediscovers after every confirmed operation before selecting the next amount', async () => {
    let balance = 9n;
    const operations: string[] = [];
    const outcomes = await executeDirectionalPairs({
      async discover() {
        operations.push(`discover ${balance}`);
        return balance > 0n
          ? [
              {
                abovePositionId,
                belowPositionId,
                amount: balance > 5n ? 5n : balance,
              },
            ]
          : [];
      },
      async execute(pair) {
        operations.push(`execute ${pair.amount}`);
        await Promise.resolve();
        balance -= pair.amount;
        operations.push('confirmed');
        return outcome;
      },
    });
    expect(outcomes).toEqual([outcome, outcome]);
    expect(operations).toEqual([
      'discover 9',
      'execute 5',
      'confirmed',
      'discover 4',
      'execute 4',
      'confirmed',
      'discover 0',
    ]);
  });

  it('returns no outcomes and submits nothing when discovery is empty', async () => {
    let submitted = false;
    expect(
      await executeDirectionalPairs({
        async discover() {
          return [];
        },
        async execute() {
          submitted = true;
          return outcome;
        },
      }),
    ).toEqual([]);
    expect(submitted).toBe(false);
  });

  it('stops on execution failure without retrying or moving to another candidate', async () => {
    const failure = new Error('transaction failed');
    let discoveries = 0;
    let executions = 0;
    await expect(
      executeDirectionalPairs({
        async discover() {
          discoveries += 1;
          return [{ abovePositionId, belowPositionId, amount: 1n }];
        },
        async execute() {
          executions += 1;
          if (executions === 2) throw failure;
          return outcome;
        },
      }),
    ).rejects.toBe(failure);
    expect(discoveries).toBe(2);
    expect(executions).toBe(2);
  });

  it('propagates a discovery failure without submitting an operation', async () => {
    const failure = new Error('incomplete position listing');
    let submitted = false;
    await expect(
      executeDirectionalPairs({
        async discover() {
          throw failure;
        },
        async execute() {
          submitted = true;
          return outcome;
        },
      }),
    ).rejects.toBe(failure);
    expect(submitted).toBe(false);
  });
});
