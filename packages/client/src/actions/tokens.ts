import {
  FetchTokenReferencesResponseSchema,
  type TokenReference,
} from '@polymarket/bindings/data';
import { unwrap } from '@polymarket/types';
import { z } from 'zod';
import type { BaseClient } from '../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import { validateWith } from '../response';
import { withRateLimitRetry } from '../retry';
import { toDataSearchParams } from './params';

const AssetSelectorsSchema = z
  .array(z.string().trim())
  .transform((values) => values.filter((value) => value !== ''))
  .pipe(
    z.array(
      z
        .string()
        .regex(/^[0-9]+$/)
        .transform((value) => value.replace(/^0+/, '') || '0')
        .refine(
          (value) => value.length <= 78,
          'At most 78 decimal digits after leading zeros are stripped',
        ),
    ),
  )
  .transform((values) => [...new Set(values)])
  .refine(
    (values) => values.length > 0 && values.length <= 50,
    'Provide between 1 and 50 distinct asset IDs',
  );

const ConditionSelectorsSchema = z
  .array(z.string().trim())
  .transform((values) => values.filter((value) => value !== ''))
  .pipe(
    z.array(
      z
        .string()
        .regex(/^0x(?:[0-9a-fA-F]{62}|[0-9a-fA-F]{64})$/)
        .transform((value) => value.toLowerCase()),
    ),
  )
  .transform((values) => [...new Set(values)])
  .refine(
    (values) => values.length > 0 && values.length <= 10,
    'Provide between 1 and 10 distinct condition IDs',
  );

const FetchTokenReferencesRequestSchema = z.union([
  z.object({
    assetIds: AssetSelectorsSchema,
    conditionIds: z.never().optional(),
  }),
  z.object({
    assetIds: z.never().optional(),
    conditionIds: ConditionSelectorsSchema,
  }),
]);

/** Select outcome assets by decimal IDs or by condition selectors. */
export type FetchTokenReferencesRequest =
  | { assetIds: string[]; conditionIds?: never }
  | { assetIds?: never; conditionIds: string[] };

export type FetchTokenReferencesError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchTokenReferencesError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches reference and settlement metadata for outcome assets.
 *
 * Provide exactly one selector family: up to 50 distinct decimal `assetIds`,
 * or up to 10 distinct `conditionIds` containing 31-byte or 32-byte hex values.
 * Elements are trimmed, blanks dropped, and duplicates removed in first-seen
 * order. Decimal IDs have leading zeros stripped and at most 78 remaining
 * digits. Conditions are lowercased without changing their width.
 *
 * Returns a direct collection. Unknown selectors contribute no rows; asset
 * lookups retain request order and condition groups retain server order.
 * Overlapping condition selectors can repeat assets. Settlement metadata and
 * outcome labels can lag by up to a minute. Transient rate limits are retried
 * automatically.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchTokenReferencesError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const references = await fetchTokenReferences(client, { assetIds: ['123'] });
 * ```
 */
export async function fetchTokenReferences(
  client: BaseClient,
  request: FetchTokenReferencesRequest,
): Promise<TokenReference[]> {
  const { assetIds, conditionIds } = parseUserInput(
    request,
    FetchTokenReferencesRequestSchema,
  );
  return unwrap(
    withRateLimitRetry(() =>
      client.data.get('/v2/tokens', {
        params: toDataSearchParams({
          tokenId: assetIds,
          condition: conditionIds,
        }),
      }),
    ).andThen(validateWith(FetchTokenReferencesResponseSchema)),
  );
}
