import { TransactionIdSchema } from '@polymarket/bindings';
import { expectTxHash } from '@polymarket/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveDirectionalThresholdPositions } from '../directional';
import {
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UserInputError,
} from '../errors';
import type { TransactionHandle, TransactionOutcome } from '../types';
import { executeDirectionalPairs } from './directional-bulk';

const eventId = '0x0400112233445566778899aabbccddeeff000400000000000000000000';
const outcome: TransactionOutcome = {
  transactionHash: expectTxHash(`0x${'ab'.repeat(32)}`),
  transactionId: null,
};

function candidate(lowLine = 1, highLine = 3, amount = 1n, event = eventId) {
  return {
    abovePositionId: deriveDirectionalThresholdPositions({
      eventId: event,
      line: lowLine,
    }).abovePositionId,
    belowPositionId: deriveDirectionalThresholdPositions({
      eventId: event,
      line: highLine,
    }).belowPositionId,
    amount,
  };
}

function transaction(
  wait: () => Promise<TransactionOutcome> = async () => outcome,
): TransactionHandle {
  return { ...outcome, wait };
}

function prepareSubmission(
  submit: (pair: ReturnType<typeof candidate>) => Promise<TransactionHandle>,
) {
  return async function prepare(pair: ReturnType<typeof candidate>) {
    return { submit: () => submit(pair) };
  };
}

async function settle<T>(pending: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return pending;
}

describe('directional bulk execution', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('rediscovers after every confirmed operation before selecting the next amount', async () => {
    let balance = 9n;
    const operations: string[] = [];
    const result = await executeDirectionalPairs({
      async discover() {
        operations.push(`discover ${balance}`);
        return balance > 0n
          ? [candidate(1, 3, balance > 5n ? 5n : balance)]
          : [];
      },
      prepare: prepareSubmission(async (pair) => {
        operations.push(`submit ${pair.amount}`);
        return transaction(async () => {
          balance -= pair.amount;
          operations.push('confirmed');
          return outcome;
        });
      }),
    });
    expect(result).toEqual({ outcomes: [outcome, outcome], errors: [] });
    expect(operations).toEqual([
      'discover 9',
      'submit 5',
      'confirmed',
      'discover 4',
      'submit 4',
      'confirmed',
      'discover 0',
    ]);
  });

  it('returns an empty summary and submits nothing when discovery is empty', async () => {
    const submit = vi.fn(async () => transaction());
    expect(
      await executeDirectionalPairs({
        discover: async () => [],
        prepare: prepareSubmission(submit),
      }),
    ).toEqual({ outcomes: [], errors: [] });
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    new TransportError('connection reset'),
    new TimeoutError('read timed out'),
    new RateLimitError('read throttled'),
    new RequestRejectedError('unavailable', { status: 503 }),
    new RequestRejectedError('read timeout', { status: 408 }),
  ])('recovers discovery after transient $name with bounded backoff', async (failure) => {
    const discover = vi.fn(async () => {
      if (discover.mock.calls.length < 3) throw failure;
      return [];
    });
    const started = Date.now();
    const result = await settle(
      executeDirectionalPairs({
        discover,
        prepare: prepareSubmission(async () => transaction()),
      }),
    );
    expect(discover).toHaveBeenCalledTimes(3);
    expect(Date.now() - started).toBe(750);
    expect(result).toEqual({ outcomes: [], errors: [] });
  });

  it('returns earlier confirmed outcomes after three exhausted discovery attempts', async () => {
    const failure = new TransportError('index unavailable');
    let reads = 0;
    const submit = vi.fn(async () => transaction());
    const result = await settle(
      executeDirectionalPairs({
        async discover() {
          if (++reads === 1) return [candidate()];
          throw failure;
        },
        prepare: prepareSubmission(submit),
      }),
    );
    expect(reads).toBe(4);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      outcomes: [outcome],
      errors: [{ phase: 'discovery', error: failure }],
    });
  });

  it('records a permanent discovery failure without retrying or submitting', async () => {
    const failure = new Error('incomplete position listing');
    const discover = vi.fn(async () => {
      throw failure;
    });
    const submit = vi.fn(async () => transaction());
    expect(
      await executeDirectionalPairs({
        discover,
        prepare: prepareSubmission(submit),
      }),
    ).toEqual({
      outcomes: [],
      errors: [{ phase: 'discovery', error: failure }],
    });
    expect(discover).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    new TransactionFailedError('preflight reverted'),
    new UserInputError('inventory changed'),
    new RateLimitError('submission rejected'),
    new RequestRejectedError('forbidden', { status: 403 }),
  ])('excludes a definite $name pair and continues with unrelated and overlapping candidates', async (failure) => {
    const best = candidate(1, 3, 9n);
    const overlapping = candidate(1, 2, 4n);
    const unrelated = candidate(
      1,
      2,
      3n,
      eventId.replace('00112233', '11223344'),
    );
    const submitted: string[] = [];
    const completed = new Set<string>();
    const result = await executeDirectionalPairs({
      async discover(excludedPairs) {
        if (submitted.length)
          expect(
            excludedPairs.has(
              `${best.abovePositionId}:${best.belowPositionId}`,
            ),
          ).toBe(true);
        // Keep returning the rejected best candidate to exercise exclusion even
        // when indexed discovery still serves stale inventory or a new amount.
        return [
          { ...best, amount: 10n },
          ...[unrelated, overlapping].filter(
            (pair) =>
              !completed.has(pair.belowPositionId + pair.abovePositionId),
          ),
        ];
      },
      prepare: prepareSubmission(async (pair) => {
        submitted.push(pair.belowPositionId + pair.abovePositionId);
        if (
          pair.abovePositionId === best.abovePositionId &&
          pair.belowPositionId === best.belowPositionId
        )
          throw failure;
        return transaction(async () => {
          completed.add(pair.belowPositionId + pair.abovePositionId);
          return outcome;
        });
      }),
    });
    expect(submitted).toEqual([
      best.belowPositionId + best.abovePositionId,
      unrelated.belowPositionId + unrelated.abovePositionId,
      overlapping.belowPositionId + overlapping.abovePositionId,
    ]);
    expect(result.outcomes).toEqual([outcome, outcome]);
    expect(result.errors).toEqual([
      {
        ...best,
        amount: 10n,
        phase: 'submission',
        error: failure,
        uncertain: false,
        transactionHash: null,
        transactionId: null,
      },
    ]);
  });

  it('retries confirmation on the same submitted handle and records only its confirmed outcome', async () => {
    const wait = vi.fn(async () => {
      if (wait.mock.calls.length < 3) throw new TimeoutError('receipt pending');
      return outcome;
    });
    const submit = vi.fn(async () => transaction(wait));
    const result = await settle(
      executeDirectionalPairs({
        async discover() {
          return wait.mock.calls.length === 3 ? [] : [candidate()];
        },
        prepare: prepareSubmission(submit),
      }),
    );
    expect(wait).toHaveBeenCalledTimes(3);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ outcomes: [outcome], errors: [] });
  });

  it('records a confirmed transaction failure and continues without resubmitting that pair', async () => {
    const failed = candidate(1, 3);
    const next = candidate(1, 2);
    const failure = new TransactionFailedError('mined revert');
    let completed = false;
    const failedWait = vi.fn(async () => {
      throw failure;
    });
    const submit = vi.fn(async (pair: ReturnType<typeof candidate>) =>
      pair.belowPositionId === failed.belowPositionId
        ? transaction(failedWait)
        : transaction(async () => {
            completed = true;
            return outcome;
          }),
    );
    const result = await executeDirectionalPairs({
      async discover() {
        return completed ? [failed] : [failed, next];
      },
      prepare: prepareSubmission(submit),
    });
    expect(submit).toHaveBeenCalledTimes(2);
    expect(failedWait).toHaveBeenCalledTimes(1);
    expect(result.outcomes).toEqual([outcome]);
    expect(result.errors).toEqual([
      {
        ...failed,
        phase: 'confirmation',
        error: failure,
        uncertain: false,
        transactionHash: outcome.transactionHash,
        transactionId: null,
      },
    ]);
  });

  it('pauses after unresolved confirmation while retaining transaction identifiers and earlier outcomes', async () => {
    const failure = new TransportError('receipt endpoint unavailable');
    const pendingId = TransactionIdSchema.parse('pending-relayed-transaction');
    const wait = vi.fn(async () => {
      throw failure;
    });
    const submit = vi.fn(async () =>
      submit.mock.calls.length === 1
        ? transaction()
        : { ...transaction(wait), transactionId: pendingId },
    );
    const result = await settle(
      executeDirectionalPairs({
        discover: async () => [candidate()],
        prepare: prepareSubmission(submit),
      }),
    );
    expect(wait).toHaveBeenCalledTimes(3);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(result.outcomes).toEqual([outcome]);
    expect(result.errors).toEqual([
      {
        ...candidate(),
        phase: 'confirmation',
        error: failure,
        uncertain: true,
        transactionHash: outcome.transactionHash,
        transactionId: pendingId,
      },
    ]);
  });

  it.each([
    new Error('unknown submission outcome'),
    new SigningError('broadcast failed', {
      cause: new TransportError('connection lost'),
    }),
    new TransportError('connection lost after sending'),
    new TimeoutError('submit deadline exceeded'),
    new RequestRejectedError('upstream failure', { status: 503 }),
    new RequestRejectedError('submit timeout', { status: 408 }),
  ])('pauses an ambiguous $name submission without retrying or submitting another pair', async (failure) => {
    const submit = vi.fn(async () => {
      throw failure;
    });
    const discover = vi.fn(async () => [candidate(1, 3), candidate(1, 2)]);
    const result = await settle(
      executeDirectionalPairs({ discover, prepare: prepareSubmission(submit) }),
    );
    expect(submit).toHaveBeenCalledTimes(1);
    expect(discover).toHaveBeenCalledTimes(1);
    expect(result.errors).toEqual([
      {
        ...candidate(),
        phase: 'submission',
        error: failure,
        uncertain: true,
        transactionHash: null,
        transactionId: null,
      },
    ]);
    expect(result.outcomes).toEqual([]);
  });

  it('treats cancelled signing as a user stop without repeated prompts', async () => {
    const failure = new CancelledSigningError('user declined');
    const submit = vi.fn(async () => {
      throw failure;
    });
    const result = await executeDirectionalPairs({
      discover: async () => [candidate(), candidate(1, 2)],
      prepare: prepareSubmission(submit),
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(result.errors).toEqual([
      {
        ...candidate(),
        phase: 'submission',
        error: failure,
        uncertain: false,
        transactionHash: null,
        transactionId: null,
      },
    ]);
  });

  it('stops after 25 definite failed pairs and reports the limit instead of exhausting all candidates', async () => {
    const pairs = Array.from({ length: 26 }, (_, index) =>
      candidate(
        1,
        3,
        1n,
        eventId.replace('00112233', index.toString(16).padStart(8, '0')),
      ),
    );
    const failure = new UserInputError('unavailable balance');
    const submit = vi.fn(async (_pair: ReturnType<typeof candidate>) => {
      throw failure;
    });
    const result = await executeDirectionalPairs({
      discover: async () => pairs,
      prepare: prepareSubmission(submit),
    });
    expect(submit).toHaveBeenCalledTimes(25);
    expect(result.outcomes).toEqual([]);
    expect(result.errors).toHaveLength(26);
    expect(
      result.errors.slice(0, 25).every((error) => error.phase === 'submission'),
    ).toBe(true);
    expect(result.errors[25]).toMatchObject({
      phase: 'limit',
      error: expect.any(Error),
    });
    expect(
      submit.mock.calls.some(
        ([pair]) => pair.abovePositionId === pairs[25]?.abovePositionId,
      ),
    ).toBe(false);
  });

  it('retries transient preparation reads before submitting exactly once', async () => {
    const submit = vi.fn(async () => transaction());
    const prepare = vi.fn(async () => {
      if (prepare.mock.calls.length < 3)
        throw new TransportError('balance read failed');
      return { submit };
    });
    const result = await settle(
      executeDirectionalPairs({
        async discover() {
          return submit.mock.calls.length ? [] : [candidate()];
        },
        prepare,
      }),
    );
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ outcomes: [outcome], errors: [] });
  });

  it('excludes exhausted preparation failures and continues without submitting the failed pair', async () => {
    const failed = candidate(1, 3);
    const next = candidate(1, 2);
    const failure = new TimeoutError('balance read timed out');
    const submit = vi.fn(async () => transaction());
    let attempts = 0;
    const result = await settle(
      executeDirectionalPairs({
        async discover() {
          return submit.mock.calls.length ? [failed] : [failed, next];
        },
        async prepare(pair) {
          if (pair.belowPositionId === failed.belowPositionId) {
            attempts += 1;
            throw failure;
          }
          return { submit };
        },
      }),
    );
    expect(attempts).toBe(3);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(result.outcomes).toEqual([outcome]);
    expect(result.errors).toEqual([
      {
        ...failed,
        phase: 'preparation',
        error: failure,
        uncertain: false,
        transactionHash: null,
        transactionId: null,
      },
    ]);
  });

  it.each([
    { retryAfter: 2, attempts: 3, elapsed: 4000 },
    { retryAfter: 6, attempts: 1, elapsed: 0 },
  ])('bounds discovery retry delay for server retryAfter=$retryAfter', async ({
    retryAfter,
    attempts,
    elapsed,
  }) => {
    const failure = new RateLimitError('retry later', { retryAfter });
    const discover = vi.fn(async () => {
      throw failure;
    });
    const submit = vi.fn(async () => transaction());
    const started = Date.now();
    const result = await settle(
      executeDirectionalPairs({ discover, prepare: prepareSubmission(submit) }),
    );
    expect(discover).toHaveBeenCalledTimes(attempts);
    expect(Date.now() - started).toBe(elapsed);
    expect(submit).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcomes: [],
      errors: [{ phase: 'discovery', error: failure }],
    });
  });
});
