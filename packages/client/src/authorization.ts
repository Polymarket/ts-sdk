import {
  ErrorResponseSchema,
  type OwnershipChallenge,
  type OwnershipChallengeRequest,
  OwnershipChallengeSchema,
} from '@polymarket/bindings';
import { setNonBlockingTimeout } from '@polymarket/types';
import { z } from 'zod';
import {
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from './errors';
import { parseUserInput } from './input';
import {
  assertNotAborted,
  DEFAULT_REQUEST_TIMEOUT_MS,
  withAbort,
} from './request-options';
import type {
  ApiKeyAuthorization,
  ApiKeyAuthorizationOptions,
  ApiKeyAuthorizationRequest,
} from './types';

export type RelayerApiKeyConfig = {
  key: string;
  address: string;
};

export type RemoteBuilderSigningConfig = {
  /**
   * URL for the application's remote builder-signing endpoint.
   *
   * This may be an absolute `http` or `https` URL, or a root-relative path
   * such as `/api/builder/sign` in browser environments.
   */
  url: string;
  /**
   * Fetch credential mode for requests to the remote signer.
   *
   * Set this when the signer relies on cookie-backed authentication, especially
   * for cross-origin requests that require `include`.
   */
  credentials?: RequestCredentials;
  /**
   * Additional headers to send to the remote signer.
   *
   * Use this for application-specific authorization such as bearer tokens,
   * tenant headers, or CSRF headers. The SDK always sends JSON.
   */
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
};

const RemoteBuilderSigningResponseSchema = z.object({
  POLY_BUILDER_API_KEY: z.string().min(1),
  POLY_BUILDER_TIMESTAMP: z.string().min(1),
  POLY_BUILDER_PASSPHRASE: z.string().min(1),
  POLY_BUILDER_SIGNATURE: z.string().min(1),
});

export function remoteBuilderSigning(
  config: RemoteBuilderSigningConfig,
): ApiKeyAuthorization {
  return new RemoteBuilderAuthorization(config);
}

export function relayerApiKey(
  config: RelayerApiKeyConfig,
): ApiKeyAuthorization {
  return new RelayerApiKeyAuthorization(config);
}

class RemoteBuilderAuthorization implements ApiKeyAuthorization {
  readonly #config: RemoteBuilderSigningConfig;

  constructor(config: RemoteBuilderSigningConfig) {
    this.#config = config;
  }

  get isBuilderKey(): boolean {
    return true;
  }

  get supportGasless(): boolean {
    return true;
  }

  async authorize(
    request: ApiKeyAuthorizationRequest,
    options?: ApiKeyAuthorizationOptions,
  ): Promise<HeadersInit> {
    try {
      assertNotAborted(options?.signal);
      const headers = await resolveJsonHeaders(
        this.#config.headers,
        options?.signal,
      );
      assertNotAborted(options?.signal);
      const fetch = options?.fetch ?? globalThis.fetch;
      const response = await withAbort(
        fetch(this.#config.url, {
          body: JSON.stringify({
            body: request.body,
            method: request.method,
            path: request.path,
          }),
          credentials: this.#config.credentials,
          headers,
          method: 'POST',
          mode: 'cors',
          signal: options?.signal,
        }),
        options?.signal,
      );
      if (!response.ok)
        throw new Error(
          `Remote signer rejected request with status ${response.status}`,
        );
      const body: unknown = await withAbort(response.json(), options?.signal);
      return RemoteBuilderSigningResponseSchema.parse(body);
    } catch (error) {
      if (error instanceof RequestAbortedError) throw error;
      throw SigningError.fromError(
        error,
        'Could not authorize the builder-authenticated request',
      );
    }
  }
}

class RelayerApiKeyAuthorization implements ApiKeyAuthorization {
  readonly #config: RelayerApiKeyConfig;

  constructor(config: RelayerApiKeyConfig) {
    this.#config = config;
  }

  get isBuilderKey(): boolean {
    return false;
  }

  get supportGasless(): boolean {
    return true;
  }

  authorize(): Promise<HeadersInit> {
    return Promise.resolve({
      RELAYER_API_KEY: this.#config.key,
      RELAYER_API_KEY_ADDRESS: this.#config.address,
    });
  }
}

/** @internal */
export const DirectApiKeyAuthorizationSchema = z.custom<ApiKeyAuthorization>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    'authorize' in value &&
    typeof value.authorize === 'function' &&
    !('authorizeGateway' in value) &&
    !('createChallenge' in value),
  'Expected a builder or submission authorization adapter',
);

export type RemotePlatformApiKeyConfig = {
  /** Complete challenge-proxy endpoint, used exactly as supplied. Absolute HTTP(S) URLs and root-relative browser paths are supported. */
  url: string;
  /** Cookie mode for authenticating to your application's backend. */
  credentials?: RequestCredentials;
  /** Application authentication or CSRF headers for the proxy. Never supply a Platform API Key or SDK session tokens here. */
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  /** Builder or submission authorization sent alongside the challenge proxy, such as `remoteBuilderSigning`. */
  submissionApiKey?: ApiKeyAuthorization;
};

const RemotePlatformApiKeyConfigSchema = z.object({
  url: z
    .string()
    .min(1)
    .refine((value) => {
      if (value.startsWith('/') && !value.startsWith('//'))
        return !value.includes('#') && !value.includes('\\');
      try {
        const url = new URL(value);
        return (
          (url.protocol === 'http:' || url.protocol === 'https:') &&
          url.username === '' &&
          url.password === '' &&
          url.hash === ''
        );
      } catch {
        return false;
      }
    }, 'Expected a complete HTTP(S) URL or root-relative challenge endpoint'),
  credentials: z.enum(['omit', 'same-origin', 'include']).optional(),
  headers: z
    .custom<HeadersInit | (() => HeadersInit | Promise<HeadersInit>)>()
    .optional(),
  submissionApiKey: DirectApiKeyAuthorizationSchema.optional(),
});

/** Configures an application backend that proxies challenge creation only.
 * Your backend must authorize the caller and keep its Platform API Key private.
 * Signing, login, refresh and logout happen directly through the SDK.
 * @example
 * ```ts
 * const apiKey = remotePlatformApiKey({ url: '/api/auth/challenge' });
 * const client = await createSecureClient({ signer, wallet, apiKey });
 * ```
 * @throws {@link UserInputError} Thrown for invalid configuration.
 */
export function remotePlatformApiKey(
  config: RemotePlatformApiKeyConfig,
): ApiKeyAuthorization {
  const parsed = parseUserInput(config, RemotePlatformApiKeyConfigSchema);
  return new RemotePlatformAuthorization(parsed);
}

class RemotePlatformAuthorization implements ApiKeyAuthorization {
  readonly #config: RemotePlatformApiKeyConfig;
  constructor(config: RemotePlatformApiKeyConfig) {
    this.#config = config;
  }
  get isBuilderKey(): boolean {
    return this.#config.submissionApiKey?.isBuilderKey ?? false;
  }
  // Challenge attribution alone does not provide separately required submission credentials.
  get supportGasless(): boolean {
    return this.#config.submissionApiKey?.supportGasless ?? false;
  }
  authorize(
    request: ApiKeyAuthorizationRequest,
    options?: ApiKeyAuthorizationOptions,
  ): Promise<HeadersInit> {
    return (
      this.#config.submissionApiKey?.authorize(request, options) ??
      Promise.resolve({})
    );
  }
  async createChallenge(
    request: OwnershipChallengeRequest,
    options?: ApiKeyAuthorizationOptions,
  ): Promise<OwnershipChallenge> {
    assertNotAborted(options?.signal);
    let response: Response;
    try {
      const headers = await resolveJsonHeaders(
        this.#config.headers,
        options?.signal,
      );
      // A platform key must never be supplied through browser configuration.
      if (headers.has('x-api-key'))
        throw new UserInputError(
          'Keep the Platform API Key on the challenge proxy backend.',
        );
      assertNotAborted(options?.signal);
      const timeout = new AbortController();
      const signal =
        options?.signal === undefined
          ? timeout.signal
          : AbortSignal.any([options.signal, timeout.signal]);
      const timer = setNonBlockingTimeout(
        () => timeout.abort(),
        DEFAULT_REQUEST_TIMEOUT_MS,
      );
      try {
        response = await withAbort(
          (options?.fetch ?? globalThis.fetch)(this.#config.url, {
            method: 'POST',
            mode: 'cors',
            cache: 'no-store',
            credentials: this.#config.credentials,
            headers,
            signal,
            body: JSON.stringify({
              signer: request.signer,
              wallet: request.wallet,
              nonce: request.nonce,
              verificationToken: request.verification_token,
            }),
          }),
          signal,
        );
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      assertNotAborted(options?.signal);
      if (error instanceof UserInputError) throw error;
      throw new TransportError('Could not reach the challenge proxy.');
    }
    if (!response.ok) {
      if (response.status === 429)
        throw new RateLimitError('The challenge proxy was rate limited.');
      const body: unknown = await withAbort(
        response.json().catch(() => undefined),
        options?.signal,
      );
      const error = ErrorResponseSchema.safeParse(body);
      const code =
        error.success && /^[a-z][a-z0-9_]{0,127}$/.test(error.data.code ?? '')
          ? error.data.code
          : undefined;
      throw new RequestRejectedError(
        'The challenge proxy rejected the request.',
        { status: response.status, code },
      );
    }
    let body: unknown;
    try {
      body = await withAbort(response.json(), options?.signal);
    } catch (error) {
      if (error instanceof RequestAbortedError) throw error;
      throw new UnexpectedResponseError(
        'The challenge proxy returned an unreadable response.',
      );
    }
    const parsed = OwnershipChallengeSchema.safeParse(body);
    if (!parsed.success)
      throw new UnexpectedResponseError(
        'The challenge proxy returned an invalid challenge.',
      );
    return parsed.data;
  }
}

async function resolveJsonHeaders(
  headers: HeadersInit | (() => HeadersInit | Promise<HeadersInit>) | undefined,
  signal?: AbortSignal,
): Promise<Headers> {
  const resolved =
    typeof headers === 'function'
      ? await withAbort(Promise.resolve(headers()), signal)
      : headers;
  const result = new Headers(resolved);
  result.set('content-type', 'application/json');
  return result;
}
