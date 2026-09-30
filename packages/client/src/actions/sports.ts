import {
  ListSportsMetadataResponseSchema,
  type SportsMarketTypesResponse,
  SportsMarketTypesResponseSchema,
  type SportsMetadata,
} from '@polymarket/bindings/gamma';
import { errAsync, unwrap } from '@polymarket/types';
import type { BaseClient } from '../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
} from '../errors';
import { shouldFallbackToGamma } from '../gateway-fallback';
import { validateWith } from '../response';

export type ListSportsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError;
export const ListSportsError = makeErrorGuard(
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
): Promise<SportsMetadata[]> {
  return unwrap(
    client.gateway
      .get('/sports')
      .andThen(validateWith(ListSportsMetadataResponseSchema))
      .orElse((error) => {
        if (!shouldFallbackToGamma(error)) {
          return errAsync(error);
        }
        return client.gamma
          .get('/sports')
          .andThen(validateWith(ListSportsMetadataResponseSchema));
      }),
  );
}

export type FetchSportsMarketTypesError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError;
export const FetchSportsMarketTypesError = makeErrorGuard(
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
): Promise<SportsMarketTypesResponse> {
  return unwrap(
    client.gateway
      .get('/sports/market-types')
      .andThen(validateWith(SportsMarketTypesResponseSchema))
      .orElse((error) => {
        if (!shouldFallbackToGamma(error)) {
          return errAsync(error);
        }
        return client.gamma
          .get('/sports/market-types')
          .andThen(validateWith(SportsMarketTypesResponseSchema));
      }),
  );
}
