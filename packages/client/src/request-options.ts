import { z } from 'zod';
import { RequestAbortedError } from './errors';
import { parseUserInput } from './input';

/**
 * A Fetch-compatible function used for SDK HTTP requests.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Controls one data read operation, including subsequent pages.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type RequestOptions = {
  /**
   * Cancels this operation's requests and retry waits.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  signal?: AbortSignal;
  /**
   * Optional retries after the first attempt. Must be an integer from 0 to 5.
   * Transport failures and rate limits share this budget for each request;
   * every pagination request gets a fresh budget. Set 0 when the caller owns retries.
   * Workflow recovery is unaffected.
   *
   * @defaultValue 2
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  retries?: number;
};

const ReadRetryOptionsSchema = z.object({
  retries: z.number().int().min(0).max(5).default(2),
});

/** Validates and snapshots controls at the read boundary. @internal */
export function parseRequestOptions(options: RequestOptions): RequestOptions {
  assertNotAborted(options.signal);
  const { retries } = parseUserInput(
    { retries: options.retries },
    ReadRetryOptionsSchema,
  );
  return { signal: options.signal, retries };
}

/** @internal */
export function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new RequestAbortedError('Request aborted', { cause: signal.reason });
  }
}

/**
 * Stops awaiting work that may not itself support cancellation.
 * @internal
 */
export function withAbort<T>(
  promise: PromiseLike<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal === undefined) return Promise.resolve(promise);

  return new Promise<T>((resolve, reject) => {
    function cleanup() {
      signal?.removeEventListener('abort', abort);
    }
    function abort() {
      cleanup();
      reject(
        new RequestAbortedError('Request aborted', { cause: signal?.reason }),
      );
    }

    // Observe the original promise even if cancellation has already happened.
    // A late callback rejection must not become an unhandled rejection.
    Promise.resolve(promise).then(
      (value) => {
        cleanup();
        if (signal.aborted) abort();
        else resolve(value);
      },
      (error: unknown) => {
        cleanup();
        if (signal.aborted) abort();
        else reject(error);
      },
    );
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
