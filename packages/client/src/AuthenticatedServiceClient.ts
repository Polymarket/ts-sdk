import { never } from '@polymarket/types';
import { TransportError } from './errors';
import type { RateLimitUpdateListener } from './rate-limit';
import type { RequestOptions } from './request-options';
import {
  assertNotAborted,
  type Fetch,
  parseRequestOptions,
  withAbort,
} from './request-options';
import {
  type RequestHeadersResolver,
  ServiceClient,
  type ServiceClientDeleteOptions,
  type ServiceClientGetOptions,
  type ServiceClientJsonResponseOptions,
  type ServiceClientNonJsonResponseOptions,
  type ServiceClientNonJsonResponseType,
  type ServiceClientPatchOptions,
  type ServiceClientPostOptions,
  type ServiceClientRequestOptions,
  type ServiceClientResponse,
  type ServiceRequest,
  type ServiceRequestMethod,
} from './ServiceClient';

type ServiceClientWorkflowGetOptions<T = unknown> =
  ServiceClientRequestOptions<T> & {
    headers?: HeadersInit;
    params?: URLSearchParams;
  };

/** Callback-owned authentication; this transport never stores credentials. */
export type AuthenticatedServiceClientConfig = {
  fetch?: Fetch;
  root?: string;
  headers?: HeadersInit;
  resolveHeaders?: RequestHeadersResolver;
  onRateLimitUpdate?: RateLimitUpdateListener;
  /** Return true only after accepting authentication for one replay. */
  refreshToken: (signal?: AbortSignal) => Promise<boolean>;
};

/**
 * Resolves request headers for each attempt and permits one authenticated replay.
 * Response parsing, HTTP errors and request options share the plain transport.
 * @experimental For the polymarket.com UI. Breaking changes may occur in any release.
 */
export class AuthenticatedServiceClient extends ServiceClient {
  readonly #config: AuthenticatedServiceClientConfig;

  constructor(config: AuthenticatedServiceClientConfig) {
    super({});
    this.#config = config;
  }

  /**
   * Sends a GET request. JSON is parsed by default; a schema validates and transforms it.
   * @throws {@link ServiceClientRequestError} Thrown on request, response or cancellation failure.
   */
  override get<T = unknown>(
    path: string,
    options?: ServiceClientGetOptions<T> & ServiceClientJsonResponseOptions<T>,
  ): Promise<T>;
  override get<TResponse extends ServiceClientNonJsonResponseType>(
    path: string,
    options: ServiceClientGetOptions &
      ServiceClientNonJsonResponseOptions<TResponse>,
  ): Promise<ServiceClientResponse<TResponse>>;
  override get(
    path: string,
    options: ServiceClientGetOptions,
  ): Promise<unknown>;
  override get(
    path: string,
    options: ServiceClientGetOptions = {},
  ): Promise<unknown> {
    return this.#dispatch('get', path, options);
  }

  /**
   * Sends a workflow GET with its existing transport policy and no optional
   * data-read retries. Some command and authentication endpoints require GET.
   * @internal
   */
  override getWorkflow<T = unknown>(
    path: string,
    options: ServiceClientWorkflowGetOptions<T> &
      ServiceClientJsonResponseOptions<T>,
  ): Promise<T>;
  /** @internal */
  override getWorkflow<TResponse extends ServiceClientNonJsonResponseType>(
    path: string,
    options: ServiceClientWorkflowGetOptions &
      ServiceClientNonJsonResponseOptions<TResponse>,
  ): Promise<ServiceClientResponse<TResponse>>;
  /** @internal */
  override getWorkflow(
    path: string,
    options: ServiceClientWorkflowGetOptions,
  ): Promise<unknown> {
    return this.#dispatch('getWorkflow', path, options);
  }

  /**
   * Sends an idempotent JSON read whose endpoint requires POST.
   * Actions own the decision that replay is safe.
   * @internal
   */
  override postRead<T = unknown>(
    path: string,
    options: ServiceClientPostOptions<T> &
      RequestOptions &
      ServiceClientJsonResponseOptions<T>,
  ): Promise<T>;
  override postRead(
    path: string,
    options: ServiceClientPostOptions & RequestOptions,
  ): Promise<unknown> {
    return this.#dispatch('postRead', path, options);
  }

  /**
   * Sends a POST request. JSON is parsed by default; a schema validates and transforms it.
   * @throws {@link ServiceClientRequestError} Thrown on request, response or cancellation failure.
   */
  override post<T = unknown>(
    path: string,
    options?: ServiceClientPostOptions<T> & ServiceClientJsonResponseOptions<T>,
  ): Promise<T>;
  override post<TResponse extends ServiceClientNonJsonResponseType>(
    path: string,
    options: ServiceClientPostOptions &
      ServiceClientNonJsonResponseOptions<TResponse>,
  ): Promise<ServiceClientResponse<TResponse>>;
  override post(
    path: string,
    options: ServiceClientPostOptions,
  ): Promise<unknown>;
  override post(
    path: string,
    options: ServiceClientPostOptions = {},
  ): Promise<unknown> {
    return this.#dispatch('post', path, options);
  }

  /**
   * Sends a PATCH request. JSON is parsed by default; a schema validates and transforms it.
   * @throws {@link ServiceClientRequestError} Thrown on request, response or cancellation failure.
   */
  override patch<T = unknown>(
    path: string,
    options?: ServiceClientPatchOptions<T> &
      ServiceClientJsonResponseOptions<T>,
  ): Promise<T>;
  override patch<TResponse extends ServiceClientNonJsonResponseType>(
    path: string,
    options: ServiceClientPatchOptions &
      ServiceClientNonJsonResponseOptions<TResponse>,
  ): Promise<ServiceClientResponse<TResponse>>;
  override patch(
    path: string,
    options: ServiceClientPatchOptions,
  ): Promise<unknown>;
  override patch(
    path: string,
    options: ServiceClientPatchOptions = {},
  ): Promise<unknown> {
    return this.#dispatch('patch', path, options);
  }

  /**
   * Sends a DELETE request. JSON is parsed by default; a schema validates and transforms it.
   * @throws {@link ServiceClientRequestError} Thrown on request, response or cancellation failure.
   */
  override del<T = unknown>(
    path: string,
    options?: ServiceClientDeleteOptions<T> &
      ServiceClientJsonResponseOptions<T>,
  ): Promise<T>;
  override del<TResponse extends ServiceClientNonJsonResponseType>(
    path: string,
    options: ServiceClientDeleteOptions &
      ServiceClientNonJsonResponseOptions<TResponse>,
  ): Promise<ServiceClientResponse<TResponse>>;
  override del(
    path: string,
    options: ServiceClientDeleteOptions,
  ): Promise<unknown>;
  override del(
    path: string,
    options: ServiceClientDeleteOptions = {},
  ): Promise<unknown> {
    return this.#dispatch('del', path, options);
  }

  #dispatch(
    method: 'get' | 'getWorkflow' | 'postRead' | 'post' | 'patch' | 'del',
    path: string,
    options:
      | ServiceClientGetOptions
      | ServiceClientPostOptions
      | ServiceClientPatchOptions
      | ServiceClientDeleteOptions,
  ): Promise<unknown> {
    if (method === 'postRead') parseRequestOptions(options);
    const client = new ServiceClient({
      root: this.#config.root,
      headers: this.#config.headers,
      onRateLimitUpdate: this.#config.onRateLimitUpdate,
      fetch: authenticatedFetch(this.#config, options.timeout),
    });
    // Only actual HTTP attempts get a deadline, not header resolution or refresh.
    const controls = { ...options, timeout: false as const };
    if (method === 'get' || method === 'getWorkflow')
      return client.get(path, controls);
    if (method === 'postRead')
      return client.postRead(
        path,
        controls as ServiceClientPostOptions &
          RequestOptions &
          ServiceClientJsonResponseOptions,
      );
    if (method === 'post') return client.post(path, controls);
    if (method === 'patch') return client.patch(path, controls);
    return client.del(path, controls);
  }
}

function authenticatedFetch(
  config: AuthenticatedServiceClientConfig,
  timeout?: number | false,
): Fetch {
  const fetch = config.fetch ?? globalThis.fetch;
  return async (input, init) => {
    const original = new Request(input, init);
    const url = new URL(original.url);
    const prefix =
      config.root === undefined
        ? ''
        : new URL(config.root).pathname.replace(/\/$/, '');
    const body =
      original.body === null ? undefined : await original.clone().text();
    const request: ServiceRequest = {
      method: original.method as ServiceRequestMethod,
      path: url.pathname.slice(prefix.length),
      params: new URLSearchParams(url.searchParams),
      body,
      json: body === undefined ? undefined : JSON.parse(body),
      headers: original.headers,
      signal: original.signal,
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      assertNotAborted(original.signal);
      const resolved = await withAbort(
        Promise.resolve(config.resolveHeaders?.(request)),
        original.signal,
      );
      assertNotAborted(original.signal);
      const headers = new Headers(original.headers);
      for (const [key, value] of new Headers(resolved)) headers.set(key, value);
      const response = await withAbort(
        sendAttempt(original, headers, body, fetch, timeout),
        original.signal,
      );
      if (
        response.status !== 401 ||
        attempt === 1 ||
        request.path.startsWith('/v1/auth/')
      )
        return response;
      // Permanent authorization failures do not rotate a bearer session.
      const failure: unknown = await withAbort(
        response
          .clone()
          .json()
          .catch(() => undefined),
        original.signal,
      );
      if (
        failure === null ||
        typeof failure !== 'object' ||
        !('code' in failure) ||
        failure.code !== 'expired_access_token'
      )
        return response;
      const refreshed = await withAbort(
        config.refreshToken(original.signal),
        original.signal,
      );
      if (!refreshed) return response;
      await response.body?.cancel();
    }
    never('Authentication replay is bounded to two attempts.');
  };
}

// Raw mode shares the plain client's per-attempt timeout and error behavior.
async function sendAttempt(
  request: Request,
  headers: Headers,
  body: string | undefined,
  fetch: Fetch,
  timeout?: number | false,
): Promise<Response> {
  const url = new URL(request.url);
  const client = new ServiceClient({
    root: url.origin,
    // The body is already serialized and signed. Do not parse or encode it again.
    fetch: (input, init) => fetch(new Request(input, { ...init, body })),
  });
  const path = url.pathname + url.search;
  const options = {
    headers,
    signal: request.signal,
    timeout,
    responseType: 'raw' as const,
  };
  try {
    if (request.method === 'GET') return await client.get(path, options);
    if (request.method === 'POST') return await client.post(path, options);
    if (request.method === 'PATCH') return await client.patch(path, options);
    if (request.method === 'DELETE') return await client.del(path, options);
    throw new TransportError('Unsupported authenticated request method.');
  } catch (error) {
    // Preserve the original attempt failure for the outer transport's retry
    // policy, including its exclusion of HTTP timeouts. It owns the public error.
    if (error instanceof TransportError && error.cause instanceof Error)
      throw error.cause;
    throw error;
  }
}
