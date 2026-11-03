import {
  type CryptoMarketConfig,
  FetchCryptoMarketConfigsResponseSchema,
} from '@polymarket/bindings/gamma';
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
import { parseRequestOptions, type RequestOptions } from '../request-options';

export type FetchCryptoMarketConfigsError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchCryptoMarketConfigsError = makeErrorGuard(
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches the complete catalog of supported crypto market configurations.
 *
 * Returns a direct collection; this catalog has no continuation.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchCryptoMarketConfigsError}
 * Thrown on failure.
 */
export async function fetchCryptoMarketConfigs(
  client: BaseClient,
  options: RequestOptions = {},
): Promise<CryptoMarketConfig[]> {
  const requestOptions = parseRequestOptions(options);
  return client.gamma.get('/crypto-market-configs', {
    schema: FetchCryptoMarketConfigsResponseSchema,
    ...requestOptions,
  });
}
