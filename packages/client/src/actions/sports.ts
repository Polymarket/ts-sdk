import {
  ListSportsMetadataResponseSchema,
  type SportsMarketTypesResponse,
  SportsMarketTypesResponseSchema,
  type SportsMetadata,
} from '@polymarket/bindings/gamma';
import { unwrap } from '@polymarket/types';
import type { BaseClient } from '../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
} from '../errors';
import type { RequestOptions } from '../request-options';
import { validateWith } from '../response';

export type ListSportsError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError;
export const ListSportsError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
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
  return unwrap(
    client.gamma
      .get('/sports', options)
      .andThen(validateWith(ListSportsMetadataResponseSchema, options)),
  );
}

export type FetchSportsMarketTypesError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError;
export const FetchSportsMarketTypesError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
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
  return unwrap(
    client.gamma
      .get('/sports/market-types', options)
      .andThen(validateWith(SportsMarketTypesResponseSchema, options)),
  );
}
