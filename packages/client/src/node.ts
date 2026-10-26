import process from 'node:process';
import {
  EvmAddressSchema,
  type OwnershipChallenge,
} from '@polymarket/bindings';
import { invariant } from '@polymarket/types';
import { z } from 'zod';
import { AuthenticationInputSchema } from './actions/identity';
import { DirectApiKeyAuthorizationSchema } from './authorization';
import type { BasePublicClient } from './clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from './errors';
import { buildHmacSignature } from './hmac';
import { parseUserInput } from './input';
import type {
  ApiKeyAuthorization,
  ApiKeyAuthorizationOptions,
  ApiKeyAuthorizationRequest,
} from './types';

invariant(
  process.release.name === 'node',
  'The @polymarket/client/node entrypoint requires a Node.js runtime.',
);
invariant(
  typeof window === 'undefined' && typeof document === 'undefined',
  'The @polymarket/client/node entrypoint cannot be imported in a browser-like runtime.',
);

export type BuilderApiKeyCreds = {
  key: string;
  secret: string;
  passphrase: string;
};

export function builderApiKey(
  options: BuilderApiKeyCreds,
): ApiKeyAuthorization {
  return new LocalBuilderApiKey(options);
}

class LocalBuilderApiKey implements ApiKeyAuthorization {
  readonly #credentials: BuilderApiKeyCreds;

  constructor(credentials: BuilderApiKeyCreds) {
    this.#credentials = credentials;
  }

  get isBuilderKey(): boolean {
    return true;
  }

  get supportGasless(): boolean {
    return true;
  }

  async authorize(request: ApiKeyAuthorizationRequest): Promise<HeadersInit> {
    try {
      const timestamp = Math.floor(Date.now() / 1000);

      return {
        POLY_BUILDER_API_KEY: this.#credentials.key,
        POLY_BUILDER_PASSPHRASE: this.#credentials.passphrase,
        POLY_BUILDER_SIGNATURE: await buildHmacSignature(
          this.#credentials.secret,
          timestamp,
          request.method,
          request.path,
          request.body,
        ),
        POLY_BUILDER_TIMESTAMP: `${timestamp}`,
      };
    } catch (error) {
      throw SigningError.fromError(
        error,
        'Could not sign the builder-authenticated request',
      );
    }
  }
}

export type PlatformApiKeyOptions = {
  /** Builder or submission authorization sent alongside the platform key, such as `builderApiKey` or `relayerApiKey`. It does not change the platform key's server-bound identity. */
  submissionApiKey?: ApiKeyAuthorization;
};

/** Configures a server-held application key. Import only from `@polymarket/client/node`.
 * @example
 * ```ts
 * const apiKey = platformApiKey(process.env.POLYMARKET_PLATFORM_API_KEY!);
 * ```
 * @throws {@link UserInputError} Thrown for an invalid key.
 */
export function platformApiKey(
  key: string,
  options: PlatformApiKeyOptions = {},
): ApiKeyAuthorization {
  const secret = parseUserInput(
    key,
    z
      .string()
      .min(1)
      .regex(/^[\x21-\x7e]+$/),
  );
  const parsed = parseUserInput(
    options,
    z.object({ submissionApiKey: DirectApiKeyAuthorizationSchema.optional() }),
  );
  return new PlatformAuthorization(secret, parsed.submissionApiKey);
}

class PlatformAuthorization implements ApiKeyAuthorization {
  readonly #key: string;
  readonly #directAuthorization: ApiKeyAuthorization | undefined;
  constructor(
    key: string,
    directAuthorization: ApiKeyAuthorization | undefined,
  ) {
    this.#key = key;
    this.#directAuthorization = directAuthorization;
  }
  get isBuilderKey(): boolean {
    return this.#directAuthorization?.isBuilderKey ?? false;
  }
  get supportGasless(): boolean {
    return this.#directAuthorization?.supportGasless ?? false;
  }
  authorizeGateway(): Promise<Record<string, string>> {
    return Promise.resolve({ 'X-API-Key': this.#key });
  }
  authorize(
    request: ApiKeyAuthorizationRequest,
    options?: ApiKeyAuthorizationOptions,
  ): Promise<HeadersInit> {
    return (
      this.#directAuthorization?.authorize(request, options) ??
      Promise.resolve({})
    );
  }
}

/** Challenge input that `remotePlatformApiKey` sends to your challenge proxy. */
export type PlatformChallengeRequest = {
  signer: string;
  wallet?: string;
  nonce?: number;
  verificationToken?: string;
};
const PlatformChallengeRequestSchema = AuthenticationInputSchema.extend({
  signer: EvmAddressSchema,
});
export type CreatePlatformChallengeError =
  | RateLimitError
  | RequestAbortedError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const CreatePlatformChallengeError = makeErrorGuard(
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/** Issues an ownership challenge attributed to your Platform API Key.
 * Call it from the backend route that `remotePlatformApiKey` targets, after
 * checking that the caller may authenticate `signer`, and return the challenge as JSON.
 * The client must be configured with `platformApiKey`.
 * @example
 * ```ts
 * const client = createPublicClient({
 *   apiKey: platformApiKey(process.env.POLYMARKET_PLATFORM_API_KEY!),
 * });
 * const challenge = await createPlatformChallenge(client, await request.json());
 * return Response.json(challenge);
 * ```
 * @throws {@link CreatePlatformChallengeError} Thrown for invalid input or a rejected challenge.
 */
export async function createPlatformChallenge(
  client: BasePublicClient,
  request: PlatformChallengeRequest,
): Promise<OwnershipChallenge> {
  const params = parseUserInput(request, PlatformChallengeRequestSchema);
  client.assertPlatformChallengeSupported();
  return client.requestOwnershipChallenge({
    signer: params.signer,
    wallet: params.wallet,
    nonce: params.nonce,
    verification_token: params.verificationToken,
  });
}
