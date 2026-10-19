import { z } from 'zod';
import { RequestAbortedError, SigningError } from './errors';
import { assertNotAborted, withAbort } from './request-options';
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
      return await this.#fetchBuilderKeyHeaders(request, options);
    } catch (error) {
      if (error instanceof RequestAbortedError) throw error;
      throw SigningError.fromError(
        error,
        'Could not authorize the builder-authenticated request',
      );
    }
  }

  async #resolveHeaders(signal?: AbortSignal): Promise<Headers> {
    const headers = this.#config.headers;
    const resolvedHeaders =
      typeof headers === 'function'
        ? await withAbort(Promise.resolve(headers()), signal)
        : headers;
    const requestHeaders = new Headers(resolvedHeaders);

    requestHeaders.set('content-type', 'application/json');

    return requestHeaders;
  }

  async #fetchBuilderKeyHeaders(
    request: ApiKeyAuthorizationRequest,
    options?: ApiKeyAuthorizationOptions,
  ): Promise<HeadersInit> {
    const headers = await this.#resolveHeaders(options?.signal);
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

    if (!response.ok) {
      throw new Error(
        `Remote signer rejected request with status ${response.status}`,
      );
    }

    const body: unknown = await withAbort(response.json(), options?.signal);
    return RemoteBuilderSigningResponseSchema.parse(body);
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
