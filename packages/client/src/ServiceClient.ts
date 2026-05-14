import { ResultAsync } from '@polymarket/types';
import ky, { type KyInstance } from 'ky';
import { RateLimitError, RequestRejectedError, TransportError } from './errors';

export type ServiceRequest = {
  method: 'DELETE' | 'GET' | 'POST';
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
  resolveHeaders?: RequestHeadersResolver;
};

export type ServiceClientGetOptions = {
  headers?: HeadersInit;
  params?: URLSearchParams;
};

export type ServiceClientPostOptions = {
  headers?: HeadersInit;
  json?: unknown;
};

export type ServiceClientDeleteOptions = {
  headers?: HeadersInit;
  json?: unknown;
  params?: URLSearchParams;
};

/**
 * Internal wrapper around a service-scoped `ky` instance.
 */
export class ServiceClient {
  readonly #client: KyInstance;
  readonly #resolveHeaders?: RequestHeadersResolver;

  constructor({ root, resolveHeaders }: ServiceClientConfig) {
    this.#client = ky.create({ prefixUrl: root, throwHttpErrors: false });
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
      | ServiceClientPostOptions,
  ): Promise<Response> {
    const request = this.#createRequest(method, path, options);
    const resolvedHeaders = await this.#resolveHeaders?.(request);
    const headers = this.#mergeHeaders(request.headers, resolvedHeaders);

    if (request.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    return this.#client(this.#normalizePath(path), {
      body: request.body,
      headers,
      method,
      searchParams: request.params,
    });
  }

  #createRequest(
    method: ServiceRequest['method'],
    path: string,
    options:
      | ServiceClientDeleteOptions
      | ServiceClientGetOptions
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

        if (response.status === 429) {
          throw new RateLimitError(
            `Request to ${response.url} was rate limited`,
          );
        }

        const message = await this.#extractResponseErrorMessage(response);
        throw new RequestRejectedError(message, {
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
