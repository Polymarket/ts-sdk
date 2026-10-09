import { err, ok, type Result, ResultAsync } from '@polymarket/types';
import type { z } from 'zod';
import { RequestAbortedError, UnexpectedResponseError } from './errors';
import { type RequestOptions, withAbort } from './request-options';

export function validateWith<TReturnType>(
  schema: z.ZodType<TReturnType>,
  options: RequestOptions = {},
) {
  return function validateResponse(
    response: Response,
  ): ResultAsync<TReturnType, UnexpectedResponseError | RequestAbortedError> {
    return ResultAsync.fromPromise(
      withAbort(response.json(), options.signal),
      (error) =>
        error instanceof RequestAbortedError
          ? error
          : new UnexpectedResponseError(
              `Received non-JSON response from ${response.url}`,
            ),
    ).andThen((payload) => {
      if (options.signal?.aborted)
        return err(
          new RequestAbortedError('Request aborted', {
            cause: options.signal.reason,
          }),
        );
      return parseResponse(response.url, schema, payload);
    });
  };
}

export function readBlob(
  response: Response,
  options: RequestOptions = {},
): ResultAsync<Blob, UnexpectedResponseError | RequestAbortedError> {
  return ResultAsync.fromPromise(
    withAbort(response.blob(), options.signal),
    (error) =>
      error instanceof RequestAbortedError
        ? error
        : new UnexpectedResponseError(
            `Received unreadable binary response from ${response.url}`,
          ),
  );
}

function parseResponse<TReturnType>(
  endpoint: string,
  schema: z.ZodType<TReturnType>,
  response: unknown,
): Result<TReturnType, UnexpectedResponseError> {
  const result = schema.safeParse(response);

  if (result.success) {
    return ok(result.data);
  }

  return err(UnexpectedResponseError.fromZodError(result.error, { endpoint }));
}
