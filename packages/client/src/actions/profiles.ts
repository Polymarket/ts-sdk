import {
  type PublicProfile,
  PublicProfileSchema,
} from '@polymarket/bindings/gamma';
import { err, ok, unwrap } from '@polymarket/types';
import { z } from 'zod';
import type { BaseClient } from '../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import type { RequestOptions } from '../request-options';
import { validateWith } from '../response';
import { snakeCase, toSearchParams } from './params';

const FetchPublicProfileRequestSchema = z.object({
  address: z.string(),
});

export type FetchPublicProfileRequest = z.input<
  typeof FetchPublicProfileRequestSchema
>;

export type FetchPublicProfileError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchPublicProfileError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches a public profile by wallet address.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchPublicProfileError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const profile = await fetchPublicProfile(client, {
 *   address: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 * });
 *
 * // profile === PublicProfile | null
 * ```
 */
export async function fetchPublicProfile(
  client: BaseClient,
  request: FetchPublicProfileRequest,
  options: RequestOptions = {},
): Promise<PublicProfile | null> {
  const params = parseUserInput(request, FetchPublicProfileRequestSchema);

  return unwrap(
    client.gamma
      .get('/public-profile', {
        signal: options.signal,
        params: toSearchParams(params, snakeCase()),
      })
      .andThen(validateWith(PublicProfileSchema, options))
      .orElse((error) => {
        if (error instanceof RequestRejectedError && error.status === 404) {
          return ok(null);
        }

        return err(error);
      }),
  );
}
