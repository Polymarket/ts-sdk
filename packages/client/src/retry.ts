import { errAsync, ResultAsync } from '@polymarket/types';
import { RateLimitError, RequestAbortedError } from './errors';
import { waitForRetry, withAbort } from './request-options';

type SleepFn = (milliseconds: number) => Promise<void>;

export type RateLimitRetryOptions = {
  retry: boolean;
  signal?: AbortSignal;
  /**
   * Maximum retry attempts after the initial request. Defaults to 2.
   */
  retries?: number;
  /**
   * The longest server-requested wait worth absorbing, in seconds. A rate
   * limit asking for a longer delay propagates instead of being retried —
   * retrying earlier than the server asked would burn the attempt into a
   * window the server already declared closed. Defaults to 5.
   */
  maxDelaySeconds?: number;
  /** @internal Test seam for controlled time. */
  sleep?: SleepFn;
};

/**
 * Retries a request pipeline when it is rate limited, honoring the
 * server-requested delay.
 *
 * Rate limiting is ordinary backpressure on this platform — shed load answers
 * with a retry delay rather than queueing — so idempotent reads should absorb
 * it instead of surfacing it on the first hit. Only {@link RateLimitError} is
 * retried; every other error propagates immediately. When the server supplies
 * no delay, one second is assumed. A requested delay longer than
 * `maxDelaySeconds` propagates rather than retrying early: the wait is always
 * exactly what the server asked for, or nothing.
 *
 * Apply this to idempotent requests only. Actions own that judgment: reads
 * compose it, mutations do not.
 */
export function withRateLimitRetry<T, E>(
  run: () => ResultAsync<T, E>,
  options: RateLimitRetryOptions,
): ResultAsync<T, E | RequestAbortedError> {
  const { retries = 2, maxDelaySeconds = 5, sleep, signal } = options;

  function attempt(remaining: number): ResultAsync<T, E | RequestAbortedError> {
    if (signal?.aborted) {
      return errAsync(
        new RequestAbortedError('Request aborted', { cause: signal.reason }),
      );
    }
    return run().orElse((error) => {
      if (signal?.aborted) {
        return errAsync(
          new RequestAbortedError('Request aborted', { cause: signal.reason }),
        );
      }
      if (!(error instanceof RateLimitError) || remaining <= 0) {
        return errAsync(error);
      }

      const delaySeconds = error.retryAfter ?? 1;
      if (delaySeconds > maxDelaySeconds) {
        return errAsync(error);
      }

      // Preserve the test seam's immediate-retry behavior on ordinary sleep
      // failure, but cancellation must never fall through to another attempt.
      const waiting =
        sleep === undefined
          ? waitForRetry(delaySeconds * 1000, signal)
          : withAbort(
              sleep(delaySeconds * 1000).catch(() => undefined),
              signal,
            );
      return ResultAsync.fromPromise(
        waiting,
        () =>
          new RequestAbortedError('Request aborted', { cause: signal?.reason }),
      ).andThen(() => attempt(remaining - 1));
    });
  }

  return attempt(options.retry ? retries : 0);
}
