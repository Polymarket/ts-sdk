import type { RateLimitUpdateListener } from './rate-limit';
import { assertNotAborted, type Fetch, withAbort } from './request-options';
import {
  type RequestHeadersResolver,
  ServiceClient,
  type ServiceRequest,
  type ServiceRequestMethod,
} from './ServiceClient';

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
  constructor(config: AuthenticatedServiceClientConfig) {
    super({
      root: config.root,
      headers: config.headers,
      onRateLimitUpdate: config.onRateLimitUpdate,
      fetch: authenticatedFetch(config),
    });
  }
}

function authenticatedFetch(config: AuthenticatedServiceClientConfig): Fetch {
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
        fetch(new Request(original.clone(), { headers })),
        original.signal,
      );
      if (
        response.status !== 401 ||
        attempt === 1 ||
        request.path.startsWith('/v1/auth/')
      )
        return response;
      const refreshed = await withAbort(
        config.refreshToken(original.signal),
        original.signal,
      );
      if (!refreshed) return response;
      await response.body?.cancel();
    }
    throw new Error('Authentication recovery failed.');
  };
}
