import { ResultAsync } from '@polymarket/types';
import ky, { type KyInstance } from 'ky';
import { RateLimitError, RequestRejectedError, TransportError } from './errors';
import { ServiceUnavailableError } from './gateway-fallback';
import {
  parseRateLimitHeaders,
  type RateLimitBucket,
  type RateLimitUpdate,
  type RateLimitUpdateListener,
} from './rate-limit';

type ServiceRequestMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST';

export type ServiceRequest = {
  method: ServiceRequestMethod;
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
  onRateLimitUpdate?: RateLimitUpdateListener;
  /** Send each request once, including reads and network failures. */
  singleAttempt?: boolean;
  /** Bound the full response body, buffering it before returning. */
  responseDeadlineMs?: number;
};

/**
 * Request timeout in milliseconds, or `false` to disable the timeout.
 * Defaults to the configured full-response deadline or the transport's standard
 * timeout. For buffered services this also bounds body consumption.
 */
type ServiceClientTimeout = number | false;

type ServiceClientRequestOptions = {
  /** Rate-limit bucket supplied by the action that owns the request. */
  rateLimitBucket?: RateLimitBucket;
  timeout?: ServiceClientTimeout;
};

export type ServiceClientGetOptions = ServiceClientRequestOptions & {
  headers?: HeadersInit;
  params?: URLSearchParams;
};

export type ServiceClientPostOptions = ServiceClientRequestOptions & {
  headers?: HeadersInit;
  json?: unknown;
};

export type ServiceClientPatchOptions = ServiceClientRequestOptions & {
  headers?: HeadersInit;
  json?: unknown;
};

export type ServiceClientDeleteOptions = ServiceClientRequestOptions & {
  headers?: HeadersInit;
  json?: unknown;
  params?: URLSearchParams;
};

/**
 * Internal wrapper around a service-scoped `ky` instance.
 */
export class ServiceClient {
  readonly #client: KyInstance;
  readonly #headers?: HeadersInit;
  readonly #resolveHeaders?: RequestHeadersResolver;
  readonly #onRateLimitUpdate?: RateLimitUpdateListener;
  readonly #responseDeadlineMs?: number;

  constructor({
    root,
    headers,
    resolveHeaders,
    onRateLimitUpdate,
    singleAttempt,
    responseDeadlineMs,
  }: ServiceClientConfig) {
    this.#client = ky.create({
      prefixUrl: root,
      throwHttpErrors: false,
      ...(singleAttempt && { retry: 0 }),
      ...(responseDeadlineMs !== undefined && {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          // Request construction happens in ky before this boundary. A fetch
          // TypeError can therefore identify network failure, but unsupported
          // protocols must still be rejected as configuration errors.
          const url = input instanceof Request ? input.url : String(input);
          if (!/^https?:/.test(url)) {
            throw new TypeError('Service URL must use HTTP or HTTPS');
          }
          try {
            return await globalThis.fetch(input, init);
          } catch (error) {
            const signal =
              init?.signal ??
              (input instanceof Request ? input.signal : undefined);
            if (
              !signal?.aborted &&
              (error instanceof TypeError ||
                (error instanceof DOMException &&
                  error.name === 'NetworkError'))
            ) {
              throw new ServiceUnavailableError('Unable to reach the service', {
                cause: error,
              });
            }
            throw error;
          }
        },
      }),
    });
    this.#headers = headers;
    this.#resolveHeaders = resolveHeaders;
    this.#onRateLimitUpdate = onRateLimitUpdate;
    this.#responseDeadlineMs = responseDeadlineMs;
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
    method: ServiceRequestMethod,
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
    return this.#toResult(
      this.#send(method, path, options),
      options.rateLimitBucket,
    );
  }

  async #send(
    method: ServiceRequestMethod,
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

    const requestOptions = {
      body: request.body,
      headers,
      method,
      searchParams: request.params,
      ...(options.timeout !== undefined && { timeout: options.timeout }),
    };

    if (this.#responseDeadlineMs === undefined) {
      return this.#client(this.#normalizePath(path), requestOptions);
    }

    return this.#sendWithDeadline(
      this.#normalizePath(path),
      requestOptions,
      options.timeout ?? this.#responseDeadlineMs,
    );
  }

  async #sendWithDeadline(
    path: string,
    options: {
      body?: string;
      headers: Headers;
      method: ServiceRequestMethod;
      searchParams?: URLSearchParams;
    },
    deadlineMs: ServiceClientTimeout,
  ): Promise<Response> {
    if (
      deadlineMs !== false &&
      (!Number.isFinite(deadlineMs) ||
        deadlineMs <= 0 ||
        deadlineMs > 2_147_483_647)
    ) {
      throw new RangeError(
        'Response deadline must be a positive supported duration',
      );
    }
    const controller = new AbortController();
    let response: Response | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const receive = async () => {
      response = await this.#client(path, {
        ...options,
        signal: controller.signal,
        timeout: false,
      });
      reader = response.body?.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      if (reader !== undefined) {
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            chunks.push(chunk.value.slice());
          }
        } finally {
          reader.releaseLock();
        }
      }
      return this.#bufferedResponse(
        response,
        response.body === null ? null : new Blob(chunks),
      );
    };

    try {
      const pending = receive();
      if (deadlineMs === false) return await pending;
      return await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new ServiceUnavailableError('Service response deadline exceeded'),
            );
            controller.abort();
            void reader?.cancel().catch(() => undefined);
          }, deadlineMs);
        }),
      ]);
    } catch (error) {
      controller.abort();
      // Once the service has rejected a request, body failures cannot change
      // that status into a connection failure eligible for another service.
      if (response !== undefined && !response.ok) {
        return this.#bufferedResponse(response, null);
      }
      if (
        reader !== undefined &&
        !(error instanceof ServiceUnavailableError) &&
        !(error instanceof DOMException && error.name === 'AbortError')
      ) {
        throw new ServiceUnavailableError('Service response stream failed', {
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  #bufferedResponse(response: Response, body: Blob | null): Response {
    const buffered = new Response(body, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
    Object.defineProperty(buffered, 'url', { value: response.url });
    return buffered;
  }

  #createRequest(
    method: ServiceRequestMethod,
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
    rateLimitBucket?: RateLimitBucket,
  ): ResultAsync<
    Response,
    RateLimitError | RequestRejectedError | TransportError
  > {
    return ResultAsync.fromPromise(
      promise.then(async (response) => {
        const rateLimit = parseRateLimitHeaders(
          response.headers,
          rateLimitBucket,
        );
        if (rateLimit !== undefined) {
          this.#notifyRateLimitUpdate(rateLimit);
        }

        if (response.ok) {
          return response;
        }

        const retryAfter = this.#parseRetryAfterHeader(response);

        if (response.status === 429) {
          throw new RateLimitError(
            `Request to ${response.url} was rate limited`,
            { rateLimit, retryAfter },
          );
        }

        const {
          code,
          message,
          retryAfter: retryAfterSeconds,
        } = await this.#extractResponseError(response);
        throw new RequestRejectedError(message, {
          code,
          retryAfter: retryAfter ?? retryAfterSeconds,
          status: response.status,
        });
      }),
      (error) => {
        if (
          error instanceof RateLimitError ||
          error instanceof RequestRejectedError ||
          error instanceof TransportError
        ) {
          return error;
        }

        return TransportError.fromError(error);
      },
    );
  }

  #notifyRateLimitUpdate(update: RateLimitUpdate): void {
    try {
      void Promise.resolve(this.#onRateLimitUpdate?.(update)).catch(
        () => undefined,
      );
    } catch {
      // A consumer-provided listener must never affect request handling.
    }
  }

  #parseRetryAfterHeader(response: Response): number | undefined {
    const value = response.headers.get('retry-after');

    if (value === null || !/^\d+$/.test(value)) {
      return undefined;
    }

    return Number(value);
  }

  async #extractResponseError(
    response: Response,
  ): Promise<{ message: string; code?: string; retryAfter?: number }> {
    const contentType = response.headers.get('content-type')?.toLowerCase();

    if (contentType?.includes('application/json')) {
      const payload: unknown = await response
        .clone()
        .json()
        .catch(() => undefined);
      const {
        error: legacyError,
        message,
        code,
        retry_after_seconds: retryAfterSeconds,
      } = (payload !== null && typeof payload === 'object' ? payload : {}) as {
        error?: unknown;
        message?: unknown;
        code?: unknown;
        retry_after_seconds?: unknown;
      };
      const error =
        legacyError || (typeof message === 'string' ? message : undefined);
      if (error) {
        const explicitCode =
          typeof code === 'string' && code !== '' ? code : undefined;
        const inferredCode =
          explicitCode === undefined &&
          response.status !== 400 &&
          typeof error === 'string' &&
          /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(error)
            ? error
            : undefined;
        const responseCode = explicitCode ?? inferredCode;
        return {
          message: `${String(error)} (${response.url})`,
          ...(responseCode !== undefined ? { code: responseCode } : {}),
          ...(typeof retryAfterSeconds === 'number' &&
          Number.isFinite(retryAfterSeconds) &&
          retryAfterSeconds >= 0
            ? { retryAfter: retryAfterSeconds }
            : {}),
        };
      }
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
        return { message: `${text} (${response.url})` };
      }
    }

    const server = response.headers.get('server')?.toLowerCase();
    if (server?.includes('cloudflare')) {
      return {
        message: `Request to ${response.url} was blocked by Cloudflare with status ${response.status}`,
      };
    }

    if (
      contentType?.includes('text/html') ||
      contentType?.includes('application/xhtml+xml')
    ) {
      return {
        message: `Request to ${response.url} failed with status ${response.status} and an unexpected HTML response body`,
      };
    }

    return {
      message: `Request to ${response.url} failed with status ${response.status} and unreadable response body`,
    };
  }
}
