import { ErrorResponseSchema } from '@polymarket/bindings';
import { OrderHeartbeatMismatchResponseSchema } from '@polymarket/bindings/clob';
import ky, { type KyInstance } from 'ky';
import { z } from 'zod';
import {
  makeErrorGuard,
  OrderHeartbeatMismatchError,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from './errors';
import { parseUserInput } from './input';
import {
  parseRateLimitHeaders,
  type RateLimitBucket,
  type RateLimitUpdate,
  type RateLimitUpdateListener,
} from './rate-limit';
import {
  assertNotAborted,
  DEFAULT_REQUEST_TIMEOUT_MS,
  type Fetch,
  parseRequestOptions,
  type RequestOptions,
  withAbort,
} from './request-options';
import { parseResponse } from './response';

export type ServiceRequestMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST';

export type ServiceRequest = {
  signal?: AbortSignal;
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
  fetch?: Fetch;
  /** Disable automatic replay of mutation requests. @internal */
  retryMutations?: false;
  /** Omit the endpoint root to create an empty client whose requests reject with UserInputError. */
  root?: string;
  headers?: HeadersInit;
  resolveHeaders?: RequestHeadersResolver;
  onRateLimitUpdate?: RateLimitUpdateListener;
};

/**
 * Timeout in milliseconds for each individual HTTP request attempt until response
 * headers arrive, or `false` to disable it. Defaults to 30 seconds.
 * This is not a total SDK method deadline: each permitted retry receives a fresh
 * timeout, so multiple requests, retries, and backoff can take longer in total.
 * Timeout errors are not retried. Excludes header resolution, hooks, retry waits,
 * and response body download/parsing.
 */
type ServiceClientTimeout = number | false;

/** @experimental See {@link ServiceClient}. */
export type ServiceClientResponseType =
  | 'json'
  | 'blob'
  | 'arrayBuffer'
  | 'text'
  | 'empty'
  | 'raw';

/** @experimental See {@link ServiceClient}. */
export type ServiceClientNonJsonResponseType = Exclude<
  ServiceClientResponseType,
  'json'
>;

/** @experimental See {@link ServiceClient}. */
// biome-ignore-start lint/suspicious/noConfusingVoidType: Empty mode represents Promise<void>.
export type ServiceClientResponse<TResponse extends ServiceClientResponseType> =
  TResponse extends 'blob'
    ? Blob
    : TResponse extends 'arrayBuffer'
      ? ArrayBuffer
      : TResponse extends 'text'
        ? string
        : TResponse extends 'empty'
          ? void
          : TResponse extends 'raw'
            ? Response
            : unknown;
// biome-ignore-end lint/suspicious/noConfusingVoidType: Empty mode represents Promise<void>.

/** @experimental See {@link ServiceClient}. */
export type ServiceClientJsonResponseOptions<T = unknown> = {
  responseType?: 'json';
  schema?: z.ZodType<T>;
};

/** @experimental See {@link ServiceClient}. */
export type ServiceClientNonJsonResponseOptions<
  TResponse extends
    ServiceClientNonJsonResponseType = ServiceClientNonJsonResponseType,
> = {
  responseType: TResponse;
  schema?: never;
};

/** @experimental See {@link ServiceClient}. */
export type ServiceClientResponseOptions<T = unknown> =
  | ServiceClientJsonResponseOptions<T>
  | ServiceClientNonJsonResponseOptions;

/** @experimental See {@link ServiceClient}. */
export type ServiceClientRequestOptions<T = unknown> =
  ServiceClientResponseOptions<T> & {
    signal?: AbortSignal;
    /** Rate-limit bucket supplied by the action that owns the request. @internal */
    rateLimitBucket?: RateLimitBucket;
    timeout?: ServiceClientTimeout;
  };

type ServiceClientMutationOptions<T = unknown> =
  ServiceClientRequestOptions<T> & {
    /** Disable transport retries for commands whose outcome may be uncertain. */
    retry?: false;
  };

/** @experimental See {@link ServiceClient}. */
export type ServiceClientGetOptions<T = unknown> =
  ServiceClientRequestOptions<T> &
    RequestOptions & {
      headers?: HeadersInit;
      params?: URLSearchParams;
    };

type ServiceClientWorkflowGetOptions<T = unknown> =
  ServiceClientRequestOptions<T> & {
    headers?: HeadersInit;
    params?: URLSearchParams;
  };

/** @experimental See {@link ServiceClient}. */
export type ServiceClientPostOptions<T = unknown> =
  ServiceClientMutationOptions<T> & {
    headers?: HeadersInit;
    json?: unknown;
  };

/** @experimental See {@link ServiceClient}. */
export type ServiceClientPatchOptions<T = unknown> =
  ServiceClientMutationOptions<T> & {
    headers?: HeadersInit;
    json?: unknown;
  };

/** @experimental See {@link ServiceClient}. */
export type ServiceClientDeleteOptions<T = unknown> =
  ServiceClientMutationOptions<T> & {
    headers?: HeadersInit;
    json?: unknown;
    params?: URLSearchParams;
  };

/** @experimental See {@link ServiceClient}. */
export type ServiceClientRequestError =
  | RateLimitError
  | RequestAbortedError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
/** @experimental See {@link ServiceClient}. */
export const ServiceClientRequestError = makeErrorGuard(
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

const ServiceClientResponseControlsSchema = z
  .object({
    responseType: z
      .enum(['json', 'blob', 'arrayBuffer', 'text', 'empty', 'raw'])
      .optional(),
    schema: z.unknown().optional(),
  })
  .refine(
    ({ responseType, schema }) =>
      schema === undefined ||
      responseType === undefined ||
      responseType === 'json',
    {
      path: ['schema'],
      message: 'Schemas are supported only with JSON responses',
    },
  );

const HTTP_DATE_MONTHS: readonly string[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const HTTP_DATE_MONTH = `(?<month>${HTTP_DATE_MONTHS.join('|')})`;
const HTTP_DATE_TIME = '(?<hour>\\d{2}):(?<minute>\\d{2}):(?<second>\\d{2})';
// RFC 9110 section 5.6.7: recipients accept IMF-fixdate and the two obsolete
// forms. The fields are read as UTC here rather than through `Date.parse`,
// which treats the asctime form as local time and accepts strings such as
// `120` or `10 Sep 2026` as dates.
const HTTP_DATE_PATTERNS = [
  new RegExp(
    `^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (?<day>\\d{2}) ${HTTP_DATE_MONTH} (?<year>\\d{4}) ${HTTP_DATE_TIME} GMT$`,
  ),
  new RegExp(
    `^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (?<day>\\d{2})-${HTTP_DATE_MONTH}-(?<year>\\d{2}) ${HTTP_DATE_TIME} GMT$`,
  ),
  new RegExp(
    `^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) ${HTTP_DATE_MONTH} (?<day> \\d|\\d{2}) ${HTTP_DATE_TIME} (?<year>\\d{4})$`,
  ),
];
const FIFTY_YEARS_MS = 50 * 365.25 * 24 * 60 * 60 * 1000;

/**
 * Parses an RFC 9110 HTTP-date into epoch milliseconds, or undefined when the
 * value is not a well-formed date. A two-digit year more than fifty years in
 * the future is read as the most recent past year with those digits.
 */
function parseHttpDate(value: string, now: number): number | undefined {
  let groups: Record<string, string | undefined> | undefined;
  for (const pattern of HTTP_DATE_PATTERNS) {
    groups = pattern.exec(value)?.groups;
    if (groups !== undefined) break;
  }
  if (groups === undefined) return undefined;
  const month = HTTP_DATE_MONTHS.indexOf(groups.month ?? '');
  if (month < 0) return undefined;
  const day = Number(groups.day);
  const hour = Number(groups.hour);
  const minute = Number(groups.minute);
  const second = Number(groups.second);
  if (hour > 23 || minute > 59 || second > 59) return undefined;
  const yearDigits = groups.year ?? '';
  let year = Number(yearDigits);
  if (yearDigits.length === 2) {
    year += Math.floor(new Date(now).getUTCFullYear() / 100) * 100;
    if (Date.UTC(year, month, day, hour, minute, second) - now > FIFTY_YEARS_MS)
      year -= 100;
  }
  const time = Date.UTC(year, month, day, hour, minute, second);
  const parsed = new Date(time);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month ||
    parsed.getUTCDate() !== day
  )
    return undefined;
  return time;
}

/**
 * Sends requests and consumes and validates their responses.
 *
 * Raw mode resolves at response headers for every status, including 4xx and
 * 5xx responses, so callers can inspect error bodies. Status checks and body
 * consumption belong to the caller. The operation signal remains attached to
 * the underlying fetch.
 *
 * @experimental For the polymarket.com UI. External consumers should not adopt this API. Breaking changes may occur in any release, including patch releases.
 */
export class ServiceClient {
  readonly #client?: KyInstance;
  readonly #headers?: HeadersInit;
  readonly #resolveHeaders?: RequestHeadersResolver;
  readonly #onRateLimitUpdate?: RateLimitUpdateListener;

  constructor(config: ServiceClientConfig) {
    const {
      root,
      headers,
      resolveHeaders,
      onRateLimitUpdate,
      fetch,
      retryMutations,
    } = config;
    if (root !== undefined) {
      this.#client = ky.create({
        prefixUrl: root,
        timeout: DEFAULT_REQUEST_TIMEOUT_MS,
        throwHttpErrors: false,
        ...(fetch === undefined ? {} : { fetch }),
        ...(retryMutations === false && { retry: { methods: ['get'] } }),
      });
    }
    this.#headers = headers;
    this.#resolveHeaders = resolveHeaders;
    this.#onRateLimitUpdate = onRateLimitUpdate;
  }

  /**
   * Sends a GET request. JSON is parsed by default; a schema validates and transforms it.
   * @throws {@link ServiceClientRequestError} Thrown on request, response or cancellation failure.
   */
  get<T = unknown>(
    path: string,
    options?: ServiceClientGetOptions<T> & ServiceClientJsonResponseOptions<T>,
  ): Promise<T>;
  get<TResponse extends ServiceClientNonJsonResponseType>(
    path: string,
    options: ServiceClientGetOptions &
      ServiceClientNonJsonResponseOptions<TResponse>,
  ): Promise<ServiceClientResponse<TResponse>>;
  get(path: string, options: ServiceClientGetOptions): Promise<unknown>;
  get(path: string, options: ServiceClientGetOptions = {}): Promise<unknown> {
    return this.#request('GET', path, options, true);
  }

  /**
   * Sends a workflow GET with its existing transport policy and no optional
   * data-read retries. Some command and authentication endpoints require GET.
   * @internal
   */
  getWorkflow<T = unknown>(
    path: string,
    options: ServiceClientWorkflowGetOptions<T> &
      ServiceClientJsonResponseOptions<T>,
  ): Promise<T>;
  /** @internal */
  getWorkflow<TResponse extends ServiceClientNonJsonResponseType>(
    path: string,
    options: ServiceClientWorkflowGetOptions &
      ServiceClientNonJsonResponseOptions<TResponse>,
  ): Promise<ServiceClientResponse<TResponse>>;
  /** @internal */
  getWorkflow(
    path: string,
    options: ServiceClientWorkflowGetOptions,
  ): Promise<unknown> {
    return this.#request('GET', path, options);
  }

  /**
   * Sends an idempotent JSON read whose endpoint requires POST.
   * Actions own the decision that replay is safe.
   * @internal
   */
  postRead<T = unknown>(
    path: string,
    options: ServiceClientPostOptions<T> &
      RequestOptions &
      ServiceClientJsonResponseOptions<T>,
  ): Promise<T>;
  postRead(
    path: string,
    options: ServiceClientPostOptions & RequestOptions,
  ): Promise<unknown> {
    return this.#request('POST', path, options, true);
  }

  /**
   * Sends a POST request. JSON is parsed by default; a schema validates and transforms it.
   * @throws {@link ServiceClientRequestError} Thrown on request, response or cancellation failure.
   */
  post<T = unknown>(
    path: string,
    options?: ServiceClientPostOptions<T> & ServiceClientJsonResponseOptions<T>,
  ): Promise<T>;
  post<TResponse extends ServiceClientNonJsonResponseType>(
    path: string,
    options: ServiceClientPostOptions &
      ServiceClientNonJsonResponseOptions<TResponse>,
  ): Promise<ServiceClientResponse<TResponse>>;
  post(path: string, options: ServiceClientPostOptions): Promise<unknown>;
  post(path: string, options: ServiceClientPostOptions = {}): Promise<unknown> {
    return this.#request('POST', path, options);
  }

  /**
   * Sends a PATCH request. JSON is parsed by default; a schema validates and transforms it.
   * @throws {@link ServiceClientRequestError} Thrown on request, response or cancellation failure.
   */
  patch<T = unknown>(
    path: string,
    options?: ServiceClientPatchOptions<T> &
      ServiceClientJsonResponseOptions<T>,
  ): Promise<T>;
  patch<TResponse extends ServiceClientNonJsonResponseType>(
    path: string,
    options: ServiceClientPatchOptions &
      ServiceClientNonJsonResponseOptions<TResponse>,
  ): Promise<ServiceClientResponse<TResponse>>;
  patch(path: string, options: ServiceClientPatchOptions): Promise<unknown>;
  patch(
    path: string,
    options: ServiceClientPatchOptions = {},
  ): Promise<unknown> {
    return this.#request('PATCH', path, options);
  }

  /**
   * Sends a DELETE request. JSON is parsed by default; a schema validates and transforms it.
   * @throws {@link ServiceClientRequestError} Thrown on request, response or cancellation failure.
   */
  del<T = unknown>(
    path: string,
    options?: ServiceClientDeleteOptions<T> &
      ServiceClientJsonResponseOptions<T>,
  ): Promise<T>;
  del<TResponse extends ServiceClientNonJsonResponseType>(
    path: string,
    options: ServiceClientDeleteOptions &
      ServiceClientNonJsonResponseOptions<TResponse>,
  ): Promise<ServiceClientResponse<TResponse>>;
  del(path: string, options: ServiceClientDeleteOptions): Promise<unknown>;
  del(
    path: string,
    options: ServiceClientDeleteOptions = {},
  ): Promise<unknown> {
    return this.#request('DELETE', path, options);
  }

  #normalizePath(path: string) {
    return path.startsWith('/') ? path.slice(1) : path;
  }

  async #request(
    method: ServiceRequestMethod,
    path: string,
    options: (
      | ServiceClientDeleteOptions
      | ServiceClientGetOptions
      | ServiceClientPatchOptions
      | ServiceClientPostOptions
    ) &
      RequestOptions,
    readOnly = false,
  ): Promise<unknown> {
    const signal = options.signal;
    try {
      assertNotAborted(signal);
      parseUserInput(
        { responseType: options.responseType, schema: options.schema },
        ServiceClientResponseControlsSchema,
      );
      const retries = readOnly
        ? parseRequestOptions(options).retries
        : undefined;
      const response = await this.#send(method, path, options, retries);
      assertNotAborted(signal);
      const rateLimit = parseRateLimitHeaders(
        response.headers,
        options.rateLimitBucket,
      );
      if (rateLimit !== undefined) this.#notifyRateLimitUpdate(rateLimit);
      // Raw callers inspect the status, headers and body themselves.
      if (options.responseType === 'raw') return response;
      if (!response.ok) {
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
          heartbeatId,
          retryAfter: retryAfterSeconds,
        } = await withAbort(this.#extractResponseError(response, path), signal);
        if (heartbeatId !== undefined) {
          throw new OrderHeartbeatMismatchError(heartbeatId);
        }
        throw new RequestRejectedError(message, {
          code,
          retryAfter: retryAfter ?? retryAfterSeconds,
          status: response.status,
        });
      }
      return await this.#consumeResponse(response, options);
    } catch (error) {
      assertNotAborted(signal);
      if (
        error instanceof RequestAbortedError ||
        error instanceof RateLimitError ||
        error instanceof RequestRejectedError ||
        error instanceof UnexpectedResponseError ||
        error instanceof UserInputError ||
        error instanceof TransportError
      )
        throw error;
      throw TransportError.fromError(error);
    }
  }

  async #consumeResponse(
    response: Response,
    options: ServiceClientRequestOptions,
  ): Promise<unknown> {
    const mode = options.responseType ?? 'json';
    assertNotAborted(options.signal);
    let value: unknown;
    try {
      switch (mode) {
        case 'blob':
          value = await withAbort(response.blob(), options.signal);
          break;
        case 'arrayBuffer':
          value = await withAbort(response.arrayBuffer(), options.signal);
          break;
        case 'text':
          value = await withAbort(response.text(), options.signal);
          break;
        case 'empty':
          await withAbort(response.arrayBuffer(), options.signal);
          value = undefined;
          break;
        case 'json':
          value = await withAbort(response.json(), options.signal);
          break;
      }
    } catch (error) {
      assertNotAborted(options.signal);
      if (error instanceof RequestAbortedError) throw error;
      const message =
        mode === 'json'
          ? `Received non-JSON response from ${response.url}`
          : `Received unreadable ${mode === 'blob' || mode === 'arrayBuffer' ? 'binary' : mode} response from ${response.url}`;
      throw new UnexpectedResponseError(message);
    }
    assertNotAborted(options.signal);
    if (mode === 'json' && options.schema !== undefined) {
      const parsed = parseResponse(response.url, options.schema, value);
      assertNotAborted(options.signal);
      return parsed;
    }
    return value;
  }

  async #send(
    method: ServiceRequestMethod,
    path: string,
    options:
      | ServiceClientDeleteOptions
      | ServiceClientGetOptions
      | ServiceClientPatchOptions
      | ServiceClientPostOptions,
    retries?: number,
  ): Promise<Response> {
    assertNotAborted(options.signal);
    const client = this.#client;
    if (client === undefined) {
      throw new UserInputError(
        'This service client has no configured endpoint',
      );
    }
    const request = this.#createRequest(method, path, options);
    const resolvedHeaders = await withAbort(
      Promise.resolve(this.#resolveHeaders?.(request)),
      options.signal,
    );
    assertNotAborted(options.signal);
    const headers = this.#mergeHeaders(
      this.#headers,
      request.headers,
      resolvedHeaders,
    );

    if (request.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    return withAbort(
      client(this.#normalizePath(path), {
        body: request.body,
        headers,
        method,
        searchParams: request.params,
        signal: options.signal,
        ...(options.timeout !== undefined && { timeout: options.timeout }),
        ...('retry' in options && options.retry === false && { retry: 0 }),
        ...(retries !== undefined && {
          // One transport-owned counter covers both network failures and 429s.
          // A new call (including each page) starts with a fresh counter.
          retry: { limit: retries, methods: [method.toLowerCase()] },
          hooks: {
            afterResponse: [
              (_request, _options, response, { retryCount }) => {
                if (
                  options.responseType === 'raw' ||
                  response.status !== 429 ||
                  retryCount >= retries
                )
                  return;
                const delaySeconds = this.#parseRetryAfterHeader(response) ?? 1;
                // Never retry earlier than the server asks. Leave long waits to callers.
                if (delaySeconds > 5) return;
                const rateLimit = parseRateLimitHeaders(
                  response.headers,
                  options.rateLimitBucket,
                );
                if (rateLimit !== undefined)
                  this.#notifyRateLimitUpdate(rateLimit);
                return ky.retry({ delay: delaySeconds * 1000 });
              },
            ],
          },
        }),
      }),
      options.signal,
    );
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
      signal: options.signal,
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

    if (value === null) {
      return undefined;
    }

    if (/^\d+$/.test(value)) {
      return Number(value);
    }

    // RFC 9110 section 10.2.3 also allows an HTTP-date. Report whole seconds
    // from now, never rounding a future deadline down, and clamp past dates.
    const now = Date.now();
    const deadline = parseHttpDate(value, now);
    if (deadline === undefined) {
      return undefined;
    }

    return Math.max(0, Math.ceil((deadline - now) / 1000));
  }

  async #extractResponseError(
    response: Response,
    path: string,
  ): Promise<{
    message: string;
    code?: string;
    retryAfter?: number;
    heartbeatId?: string;
  }> {
    const contentType = response.headers.get('content-type')?.toLowerCase();

    if (contentType?.includes('application/json')) {
      const body: unknown = await response
        .clone()
        .json()
        .catch(() => undefined);
      if (
        response.status === 400 &&
        this.#normalizePath(path) === 'v1/heartbeats'
      ) {
        const parsed = OrderHeartbeatMismatchResponseSchema.safeParse(body);
        if (parsed.success) {
          return {
            message: parsed.data.error_msg,
            heartbeatId: parsed.data.heartbeat_id,
          };
        }
      }
      const parsed = ErrorResponseSchema.safeParse(body);
      if (parsed.success) {
        const { message, code, retryAfter } = parsed.data;
        const inferredCode =
          code === undefined &&
          response.status !== 400 &&
          /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(message)
            ? message
            : undefined;
        return {
          message: `${message} (${response.url})`,
          code: code ?? inferredCode,
          retryAfter,
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
