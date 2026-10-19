import {
  ListSportsMetadataResponseSchema,
  type SportsMarketTypesResponse,
  SportsMarketTypesResponseSchema,
  type SportsMetadata,
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

export type ListSportsError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListSportsError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists available sports metadata.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListSportsError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const sports = await listSports(client);
 *
 * // sports: SportsMetadata[]
 * ```
 */
export async function listSports(
  client: BaseClient,
  options: RequestOptions = {},
): Promise<SportsMetadata[]> {
  const requestOptions = parseRequestOptions(options);
  return client.gamma.get('/sports', {
    ...requestOptions,
    schema: ListSportsMetadataResponseSchema,
  });
}

export type FetchSportsMarketTypesError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchSportsMarketTypesError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches the available market types grouped by sport.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchSportsMarketTypesError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const marketTypes = await fetchSportsMarketTypes(client);
 *
 * // marketTypes === SportsMarketTypesResponse
 * ```
 */
export async function fetchSportsMarketTypes(
  client: BaseClient,
  options: RequestOptions = {},
): Promise<SportsMarketTypesResponse> {
  const requestOptions = parseRequestOptions(options);
  return client.gamma.get('/sports/market-types', {
    ...requestOptions,
    schema: SportsMarketTypesResponseSchema,
  });
}
