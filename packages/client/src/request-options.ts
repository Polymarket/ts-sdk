import { RequestAbortedError } from './errors';

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
 * Controls the lifetime of one read operation, including subsequent pages.
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
};

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

/**
 * An interruptible delay that releases its timer on cancellation.
 * @internal
 */
export function waitForRetry(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    function abort() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(
        new RequestAbortedError('Request aborted', { cause: signal?.reason }),
      );
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
