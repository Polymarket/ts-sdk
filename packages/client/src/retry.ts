import { errAsync, ResultAsync } from '@polymarket/types';
import { RateLimitError } from './errors';

type SleepFn = (milliseconds: number) => Promise<void>;

export type RateLimitRetryOptions = {
  /**
   * Maximum retry attempts after the initial request. Defaults to 2.
   */
  retries?: number;
  /**
   * Upper bound in seconds applied to any single server-requested wait.
   * Defaults to 5.
   */
  maxDelaySeconds?: number;
  /** @internal Test seam for controlled time. */
  sleep?: SleepFn;
};

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * Retries a request pipeline when it is rate limited, honoring the
 * server-requested delay.
 *
 * Rate limiting is ordinary backpressure on this platform — shed load answers
 * with a retry delay rather than queueing — so idempotent reads should absorb
 * it instead of surfacing it on the first hit. Only {@link RateLimitError} is
 * retried; every other error propagates immediately. When the server supplies
 * no delay, one second is assumed. Waits are capped by `maxDelaySeconds`.
 *
 * Apply this to idempotent requests only. Actions own that judgment: reads
 * compose it, mutations do not.
 */
export function withRateLimitRetry<T, E>(
  run: () => ResultAsync<T, E>,
  options: RateLimitRetryOptions = {},
): ResultAsync<T, E> {
  const { retries = 2, maxDelaySeconds = 5, sleep = defaultSleep } = options;

  function attempt(remaining: number): ResultAsync<T, E> {
    return run().orElse((error) => {
      if (!(error instanceof RateLimitError) || remaining <= 0) {
        return errAsync(error);
      }

      const delaySeconds = Math.min(error.retryAfter ?? 1, maxDelaySeconds);

      return ResultAsync.fromSafePromise(sleep(delaySeconds * 1000)).andThen(
        () => attempt(remaining - 1),
      );
    });
  }

  return attempt(retries);
}
