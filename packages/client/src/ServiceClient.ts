import { ResultAsync } from '@polymarket/types';
import ky, { type KyInstance } from 'ky';
import { RateLimitError, RequestRejectedError, TransportError } from './errors';

export type ServiceRequest = {
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST';
  path: string;
  body?: string;
  headers?: HeadersInit;
  json?: unknown;
  params?: URLSearchParams;
};

export type RequestHeadersResolver = (
  request: ServiceRequest,
) => Promise<HeadersInit>;

export type ServiceClientConfig = {
  root: string;
  headers?: HeadersInit;
  resolveHeaders?: RequestHeadersResolver;
};

/**
 * Request timeout in milliseconds, or `false` to disable the timeout.
 * Defaults to the transport's standard timeout.
 */
type ServiceClientTimeout = number | false;

export type ServiceClientGetOptions = {
  headers?: HeadersInit;
  params?: URLSearchParams;
  timeout?: ServiceClientTimeout;
};

export type ServiceClientPostOptions = {
  headers?: HeadersInit;
  json?: unknown;
  timeout?: ServiceClientTimeout;
};

export type ServiceClientPatchOptions = {
  headers?: HeadersInit;
  json?: unknown;
  timeout?: ServiceClientTimeout;
};

export type ServiceClientDeleteOptions = {
  headers?: HeadersInit;
  json?: unknown;
  params?: URLSearchParams;
  timeout?: ServiceClientTimeout;
};

/**
 * Internal wrapper around a service-scoped `ky` instance.
 */
export class ServiceClient {
  readonly #client: KyInstance;
  readonly #headers?: HeadersInit;
  readonly #resolveHeaders?: RequestHeadersResolver;

  constructor({ root, headers, resolveHeaders }: ServiceClientConfig) {
    this.#client = ky.create({ prefixUrl: root, throwHttpErrors: false });
    this.#headers = headers;
    this.#resolveHeaders = resolveHeaders;
  }

  get(
    path: string,
    options: ServiceClientGetOptions = {},
  ): ResultAsync<
    Response,
    RateLimitError | RequestRejectedError | TransportError
  > {
    return this.#request('GET', path, options);
  }

  post(
    path: string,
    options: ServiceClientPostOptions = {},
  ): ResultAsync<
    Response,
    RateLimitError | RequestRejectedError | TransportError
  > {
    return this.#request('POST', path, options);
  }

  patch(
    path: string,
    options: ServiceClientPatchOptions = {},
  ): ResultAsync<
    Response,
    RateLimitError | RequestRejectedError | TransportError
  > {
    return this.#request('PATCH', path, options);
  }

  del(
    path: string,
    options: ServiceClientDeleteOptions = {},
  ): ResultAsync<
    Response,
    RateLimitError | RequestRejectedError | TransportError
  > {
    return this.#request('DELETE', path, options);
  }

  #normalizePath(path: string) {
    return path.startsWith('/') ? path.slice(1) : path;
  }

  #request(
    method: ServiceRequest['method'],
    path: string,
    options:
      | ServiceClientDeleteOptions
      | ServiceClientGetOptions
      | ServiceClientPatchOptions
      | ServiceClientPostOptions,
  ): ResultAsync<
    Response,
    RateLimitError | RequestRejectedError | TransportError
  > {
    return this.#toResult(this.#send(method, path, options));
  }

  async #send(
    method: ServiceRequest['method'],
    path: string,
    options:
      | ServiceClientDeleteOptions
      | ServiceClientGetOptions
      | ServiceClientPatchOptions
      | ServiceClientPostOptions,
  ): Promise<Response> {
    const request = this.#createRequest(method, path, options);
    const resolvedHeaders = await this.#resolveHeaders?.(request);
    const headers = this.#mergeHeaders(
      this.#headers,
      request.headers,
      resolvedHeaders,
    );

    if (request.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    return this.#client(this.#normalizePath(path), {
      body: request.body,
      headers,
      method,
      searchParams: request.params,
      ...(options.timeout !== undefined && { timeout: options.timeout }),
    });
  }

  #createRequest(
    method: ServiceRequest['method'],
    path: string,
    options:
      | ServiceClientDeleteOptions
      | ServiceClientGetOptions
      | ServiceClientPatchOptions
      | ServiceClientPostOptions,
  ): ServiceRequest {
    return {
      body: 'json' in options ? this.#serializeJson(options.json) : undefined,
      headers: options.headers,
      json: 'json' in options ? options.json : undefined,
      method,
      params: 'params' in options ? options.params : undefined,
      path,
    };
  }

  #serializeJson(json: unknown): string | undefined {
    if (json === undefined) {
      return undefined;
    }

    return JSON.stringify(json);
  }

  #mergeHeaders(...sources: Array<HeadersInit | undefined>): Headers {
    const headers = new Headers();

    for (const source of sources) {
      if (source === undefined) {
        continue;
      }

      for (const [key, value] of new Headers(source).entries()) {
        headers.set(key, value);
      }
    }

    return headers;
  }

  #toResult(
    promise: Promise<Response>,
  ): ResultAsync<
    Response,
    | RateLimitError
    | RequestRejectedError
    | RequestRejectedError
    | TransportError
  > {
    return ResultAsync.fromPromise(
      promise.then(async (response) => {
        if (response.ok) {
          return response;
        }

        const retryAfter = this.#parseRetryAfterHeader(response);

        if (response.status === 429) {
          throw new RateLimitError(
            `Request to ${response.url} was rate limited`,
            { retryAfter },
          );
        }

        const message = await this.#extractResponseErrorMessage(response);
        throw new RequestRejectedError(message, {
          retryAfter,
          status: response.status,
        });
      }),
      (error) => {
        if (
          error instanceof RateLimitError ||
          error instanceof RequestRejectedError
        ) {
          return error;
        }

        return TransportError.fromError(error);
      },
    );
  }

  #parseRetryAfterHeader(response: Response): number | undefined {
    const value = response.headers.get('retry-after');

    if (value === null || !/^\d+$/.test(value)) {
      return undefined;
    }

    return Number(value);
  }

  async #extractResponseErrorMessage(response: Response) {
    const contentType = response.headers.get('content-type')?.toLowerCase();

    if (contentType?.includes('application/json')) {
      const { error } = await response
        .clone()
        .json()
        .catch(() => ({}));
      if (error) return `${String(error)} (${response.url})`;
    }

    if (contentType?.includes('text/plain')) {
      const text = await response
        .clone()
        .text()
        .then(
          (body) => body.trim(),
          () => '',
        );

      if (text) {
        return `${text} (${response.url})`;
      }
    }

    const server = response.headers.get('server')?.toLowerCase();
    if (server?.includes('cloudflare')) {
      return `Request to ${response.url} was blocked by Cloudflare with status ${response.status}`;
    }

    if (
      contentType?.includes('text/html') ||
      contentType?.includes('application/xhtml+xml')
    ) {
      return `Request to ${response.url} failed with status ${response.status} and an unexpected HTML response body`;
    }

    return `Request to ${response.url} failed with status ${response.status} and unreadable response body`;
  }
}
