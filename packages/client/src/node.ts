import process from 'node:process';
import { invariant } from '@polymarket/types';
import { z } from 'zod';
import { DirectApiKeyAuthorizationSchema } from './authorization';
import { SigningError, UserInputError } from './errors';
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
    return this.#authorize(request);
  }

  async #authorize(request: ApiKeyAuthorizationRequest): Promise<HeadersInit> {
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
  /** Retain required builder/submission authorization during migration. This does not change the platform key's server-bound identity. */
  legacyApiKey?: ApiKeyAuthorization;
};
export type PlatformApiKeyError = UserInputError;
export const PlatformApiKeyError = UserInputError;

/** Configures a server-held application key. Import only from `@polymarket/client/node`.
 * @example
 * ```ts
 * const apiKey = platformApiKey(process.env.POLYMARKET_PLATFORM_API_KEY!);
 * ```
 * @throws {@link PlatformApiKeyError} Thrown for an invalid key.
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
    z.object({ legacyApiKey: DirectApiKeyAuthorizationSchema.optional() }),
  );
  return new PlatformAuthorization(secret, parsed.legacyApiKey);
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
    return true;
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
