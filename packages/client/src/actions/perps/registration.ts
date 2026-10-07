import { EvmAddressSchema } from '@polymarket/bindings';
import { PerpsRegistrationResponseSchema } from '@polymarket/bindings/perps';
import { unwrap } from '@polymarket/types';
import { z } from 'zod';
import type { BaseClient } from '../../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../../errors';
import { parseUserInput } from '../../input';
import { validateWith } from '../../response';
import { toSearchParams } from '../params';

const FetchPerpsRegistrationRequestSchema = z.object({
  address: EvmAddressSchema,
}) satisfies z.ZodType<FetchPerpsRegistrationRequest>;

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type FetchPerpsRegistrationRequest = {
  /** Address whose Perps account registration should be checked. */
  address: string;
};

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type FetchPerpsRegistrationError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const FetchPerpsRegistrationError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches whether an address has a Perps account without authentication.
 * Registration is permanent; a false result may be cached for up to ten seconds.
 *
 * @throws {@link FetchPerpsRegistrationError} Thrown on failure.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsRegistration(
  client: BaseClient,
  request: FetchPerpsRegistrationRequest,
): Promise<boolean> {
  const params = parseUserInput(request, FetchPerpsRegistrationRequestSchema);
  return unwrap(
    client.perps
      .get('/v1/info/registered', {
        params: toSearchParams(params, { address: 'address' }),
      })
      .andThen(validateWith(PerpsRegistrationResponseSchema)),
  );
}
