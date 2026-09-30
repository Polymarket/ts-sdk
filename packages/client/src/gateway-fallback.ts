import { RequestRejectedError, TransportError } from './errors';

/** An actual connection, response stream, or response deadline failure. */
export class ServiceUnavailableError extends TransportError {}

/** Whether a discovery request may be attempted against its direct service. */
export function shouldFallbackToGamma(error: unknown): boolean {
  return (
    error instanceof ServiceUnavailableError ||
    (error instanceof RequestRejectedError &&
      (error.status === 502 || error.status === 503 || error.status === 504))
  );
}
