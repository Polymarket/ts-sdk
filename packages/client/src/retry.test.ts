import { errAsync, okAsync, type ResultAsync } from '@polymarket/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => vi.useRealTimers());

  it('returns the first rate limit without waiting when retries are disabled', async () => {
    const { waits, sleep } = recordingSleep();
    const limited = new RateLimitError('limited');
    const pipeline = scripted(() => errAsync(limited));

    const result = await withRateLimitRetry(pipeline.run, {
      retry: false,
      sleep,
    });

    expect(result._unsafeUnwrapErr()).toBe(limited);
    expect(pipeline.calls()).toBe(1);
    expect(waits).toEqual([]);
  });

  it('does not start an already cancelled attempt', async () => {
    const controller = new AbortController();
    const reason = { query: 'cancelled' };
    controller.abort(reason);
    const pipeline = scripted();

    const result = await withRateLimitRetry(pipeline.run, {
      retry: true,
      signal: controller.signal,
    });

    expect(result._unsafeUnwrapErr()).toMatchObject({
      name: 'RequestAbortedError',
      cause: reason,
    });
    expect(pipeline.calls()).toBe(0);
  });

  it('cancels a rate-limit wait and clears its timer without another attempt', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const reason = new Error('query replaced');
    const pipeline = scripted(() => errAsync(new RateLimitError('limited')));
    const pending = withRateLimitRetry(pipeline.run, {
      retry: true,
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    controller.abort(reason);

    const result = await pending;
    expect(result._unsafeUnwrapErr()).toMatchObject({
      name: 'RequestAbortedError',
      cause: reason,
    });
    expect(pipeline.calls()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('checks cancellation again after a retry wait completes', async () => {
    const controller = new AbortController();
    const pipeline = scripted(() => errAsync(new RateLimitError('limited')));

    const result = await withRateLimitRetry(pipeline.run, {
      retry: true,
      signal: controller.signal,
      sleep: async () => {
        controller.abort('cancelled at retry boundary');
      },
    });

    expect(result._unsafeUnwrapErr()).toMatchObject({
      name: 'RequestAbortedError',
      cause: 'cancelled at retry boundary',
    });
    expect(pipeline.calls()).toBe(1);
  });

  it('retries a rate-limited attempt and honors the server-requested delay', async () => {
    const { waits, sleep } = recordingSleep();
    const pipeline = scripted(
      () => errAsync(new RateLimitError('limited', { retryAfter: 2 })),
      () => okAsync('served'),
    );

    const result = await withRateLimitRetry(pipeline.run, {
      retry: true,
      sleep,
    });

    expect(result._unsafeUnwrap()).toBe('served');
    expect(pipeline.calls()).toBe(2);
    expect(waits).toEqual([2000]);
  });

  it('assumes one second when the server supplies no delay', async () => {
    const { waits, sleep } = recordingSleep();
    const pipeline = scripted(
      () => errAsync(new RateLimitError('limited')),
      () => okAsync('served'),
    );

    const result = await withRateLimitRetry(pipeline.run, {
      retry: true,
      sleep,
    });

    expect(result._unsafeUnwrap()).toBe('served');
    expect(waits).toEqual([1000]);
  });

  it('propagates instead of retrying early when the requested delay exceeds the cap', async () => {
    const { waits, sleep } = recordingSleep();
    const limited = new RateLimitError('limited', { retryAfter: 120 });
    const pipeline = scripted(() => errAsync(limited));

    const result = await withRateLimitRetry(pipeline.run, {
      maxDelaySeconds: 5,
      retry: true,
      sleep,
    });

    expect(result._unsafeUnwrapErr()).toBe(limited);
    expect(pipeline.calls()).toBe(1);
    expect(waits).toEqual([]);
  });

  it('surfaces the rate limit once retries are exhausted', async () => {
    const { sleep } = recordingSleep();
    const pipeline = scripted(
      () => errAsync(new RateLimitError('limited', { retryAfter: 0 })),
      () => errAsync(new RateLimitError('limited', { retryAfter: 0 })),
      () => errAsync(new RateLimitError('still limited', { retryAfter: 0 })),
    );

    const result = await withRateLimitRetry(pipeline.run, {
      retry: true,
      sleep,
    });

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(RateLimitError);
    expect(result._unsafeUnwrapErr().message).toBe('still limited');
    expect(pipeline.calls()).toBe(3);
  });

  it('does not retry other errors', async () => {
    const { waits, sleep } = recordingSleep();
    const rejection = new RequestRejectedError('bad request', { status: 400 });
    const pipeline = scripted(() => errAsync(rejection));

    const result = await withRateLimitRetry(pipeline.run, {
      retry: true,
      sleep,
    });

    expect(result._unsafeUnwrapErr()).toBe(rejection);
    expect(pipeline.calls()).toBe(1);
    expect(waits).toEqual([]);
  });
});
