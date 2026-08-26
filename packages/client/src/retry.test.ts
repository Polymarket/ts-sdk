import { errAsync, okAsync, type ResultAsync } from '@polymarket/types';
import { describe, expect, it } from 'vitest';
import { RateLimitError, RequestRejectedError } from './errors';
import { withRateLimitRetry } from './retry';

type Outcome = ResultAsync<string, RateLimitError | RequestRejectedError>;

function scripted(...outcomes: Array<() => Outcome>) {
  let call = 0;
  return {
    run(): Outcome {
      const outcome = outcomes[call];
      call += 1;
      if (outcome === undefined) {
        throw new Error(`unexpected attempt ${call}`);
      }
      return outcome();
    },
    calls: () => call,
  };
}

function recordingSleep() {
  const waits: number[] = [];
  return {
    waits,
    sleep(milliseconds: number) {
      waits.push(milliseconds);
      return Promise.resolve();
    },
  };
}

describe('withRateLimitRetry', () => {
  it('retries a rate-limited attempt and honors the server-requested delay', async () => {
    const { waits, sleep } = recordingSleep();
    const pipeline = scripted(
      () => errAsync(new RateLimitError('limited', { retryAfter: 2 })),
      () => okAsync('served'),
    );

    const result = await withRateLimitRetry(pipeline.run, { sleep });

    expect(result._unsafeUnwrap()).toBe('served');
    expect(pipeline.calls()).toBe(2);
    expect(waits).toEqual([2000]);
  });

  it('assumes one second when the server supplies no delay and caps long delays', async () => {
    const { waits, sleep } = recordingSleep();
    const pipeline = scripted(
      () => errAsync(new RateLimitError('limited')),
      () => errAsync(new RateLimitError('limited', { retryAfter: 120 })),
      () => okAsync('served'),
    );

    const result = await withRateLimitRetry(pipeline.run, {
      maxDelaySeconds: 5,
      sleep,
    });

    expect(result._unsafeUnwrap()).toBe('served');
    expect(waits).toEqual([1000, 5000]);
  });

  it('surfaces the rate limit once retries are exhausted', async () => {
    const { sleep } = recordingSleep();
    const pipeline = scripted(
      () => errAsync(new RateLimitError('limited', { retryAfter: 0 })),
      () => errAsync(new RateLimitError('limited', { retryAfter: 0 })),
      () => errAsync(new RateLimitError('still limited', { retryAfter: 0 })),
    );

    const result = await withRateLimitRetry(pipeline.run, { sleep });

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(RateLimitError);
    expect(result._unsafeUnwrapErr().message).toBe('still limited');
    expect(pipeline.calls()).toBe(3);
  });

  it('does not retry other errors', async () => {
    const { waits, sleep } = recordingSleep();
    const rejection = new RequestRejectedError('bad request', { status: 400 });
    const pipeline = scripted(() => errAsync(rejection));

    const result = await withRateLimitRetry(pipeline.run, { sleep });

    expect(result._unsafeUnwrapErr()).toBe(rejection);
    expect(pipeline.calls()).toBe(1);
    expect(waits).toEqual([]);
  });
});
