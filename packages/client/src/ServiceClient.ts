import { ResultAsync } from '@polymarket/types';
import ky, { type KyInstance } from 'ky';
import {
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  TransportError,
} from './errors';
import {
  parseRateLimitHeaders,
  type RateLimitBucket,
  type RateLimitUpdate,
  type RateLimitUpdateListener,
} from './rate-limit';
import {
  assertNotAborted,
  type Fetch,
  type RequestOptions,
  withAbort,
} from './request-options';

export type ServiceRequest = {
  signal?: AbortSignal;
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
  fetch?: Fetch;
  retry?: boolean;
  root: string;
  headers?: HeadersInit;
  resolveHeaders?: RequestHeadersResolver;
  onRateLimitUpdate?: RateLimitUpdateListener;
};

/**
 * Request timeout in milliseconds, or `false` to disable the timeout.
 * Defaults to the transport's standard timeout.
 */
type ServiceClientTimeout = number | false;

type ServiceClientRequestOptions = RequestOptions & {
  /** Rate-limit bucket supplied by the action that owns the request. */
  rateLimitBucket?: RateLimitBucket;
  timeout?: ServiceClientTimeout;
  /** Disable transport retries for commands whose outcome may be uncertain. */
  retry?: false;
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
 * Internal wrapper around a service-scoped `ky` instance.
 */
export class ServiceClient {
  readonly #client: KyInstance;
  readonly #headers?: HeadersInit;
  readonly #resolveHeaders?: RequestHeadersResolver;
  readonly #onRateLimitUpdate?: RateLimitUpdateListener;

  constructor({
    root,
    headers,
    resolveHeaders,
    onRateLimitUpdate,
    fetch,
    retry,
  }: ServiceClientConfig) {
    this.#client = ky.create({
      prefixUrl: root,
      throwHttpErrors: false,
      ...(fetch === undefined ? {} : { fetch }),
      ...(retry === false ? { retry: 0 } : {}),
    });
    this.#headers = headers;
    this.#resolveHeaders = resolveHeaders;
    this.#onRateLimitUpdate = onRateLimitUpdate;
  }

  get(
    path: string,
    options: ServiceClientGetOptions = {},
  ): ResultAsync<
    Response,
    RateLimitError | RequestAbortedError | RequestRejectedError | TransportError
  > {
    return this.#request('GET', path, options);
  }

  post(
    path: string,
    options: ServiceClientPostOptions = {},
  ): ResultAsync<
    Response,
    RateLimitError | RequestAbortedError | RequestRejectedError | TransportError
  > {
    return this.#request('POST', path, options);
  }

  patch(
    path: string,
    options: ServiceClientPatchOptions = {},
  ): ResultAsync<
    Response,
    RateLimitError | RequestAbortedError | RequestRejectedError | TransportError
  > {
    return this.#request('PATCH', path, options);
  }

  del(
    path: string,
    options: ServiceClientDeleteOptions = {},
  ): ResultAsync<
    Response,
    RateLimitError | RequestAbortedError | RequestRejectedError | TransportError
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
    RateLimitError | RequestAbortedError | RequestRejectedError | TransportError
  > {
    return this.#toResult(
      this.#send(method, path, options),
      options.rateLimitBucket,
      options.signal,
    );
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
    assertNotAborted(options.signal);
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
      this.#client(this.#normalizePath(path), {
        body: request.body,
        headers,
        method,
        searchParams: request.params,
        signal: options.signal,
        ...(options.timeout !== undefined && { timeout: options.timeout }),
        ...(options.retry === false && { retry: 0 }),
      }),
      options.signal,
    );
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

  #toResult(
    promise: Promise<Response>,
    rateLimitBucket?: RateLimitBucket,
    signal?: AbortSignal,
  ): ResultAsync<
    Response,
    RateLimitError | RequestAbortedError | RequestRejectedError | TransportError
  > {
    return ResultAsync.fromPromise(
      withAbort(
        promise.then(async (response) => {
          assertNotAborted(signal);
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
          } = await withAbort(this.#extractResponseError(response), signal);
          throw new RequestRejectedError(message, {
            code,
            retryAfter: retryAfter ?? retryAfterSeconds,
            status: response.status,
          });
        }),
        signal,
      ),
      (error) => {
        if (signal?.aborted)
          return new RequestAbortedError('Request aborted', {
            cause: signal.reason,
          });
        if (
          error instanceof RequestAbortedError ||
          error instanceof RateLimitError ||
          error instanceof RequestRejectedError
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
  ): Promise<{ message: string; code?: string; retryAfter?: number }> {
    const contentType = response.headers.get('content-type')?.toLowerCase();

    if (contentType?.includes('application/json')) {
      const {
        error,
        code,
        retry_after_seconds: retryAfterSeconds,
      } = await response
        .clone()
        .json()
        .catch(() => ({}));
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
