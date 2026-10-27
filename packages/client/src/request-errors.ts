import {
  OrderHeartbeatMismatchError,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from './errors';
import type { Fetch } from './request-options';

function redact(message: string, secrets: Iterable<string>): string {
  let result = message;
  for (const secret of [...secrets]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length))
    result = result.replaceAll(secret, '[REDACTED]');
  return result;
}

/** Redact diagnostics without retaining untrusted causes or custom properties. @internal */
export function redactRequestError(
  error: unknown,
  secrets: Iterable<string>,
  sensitive = false,
): unknown {
  if (error instanceof Error) {
    const message = redact(error.message, secrets);
    if (error instanceof OrderHeartbeatMismatchError)
      return new OrderHeartbeatMismatchError(error.heartbeatId);
    if (error instanceof RequestRejectedError)
      return new RequestRejectedError(message, {
        status: error.status,
        code: error.code,
        retryAfter: error.retryAfter,
        restriction: error.restriction,
      });
    if (error instanceof RateLimitError)
      return new RateLimitError(message, {
        retryAfter: error.retryAfter,
        rateLimit: error.rateLimit,
      });
    if (error instanceof RequestAbortedError)
      return new RequestAbortedError(message);
    if (error instanceof UnexpectedResponseError)
      return new UnexpectedResponseError(message);
    if (error instanceof SigningError) return new SigningError(message);
    if (error instanceof UserInputError) return new UserInputError(message);
    return new TransportError(
      sensitive && !(error instanceof TransportError)
        ? 'Authentication transport failed.'
        : message,
    );
  }
  return new TransportError(
    sensitive ? 'Authentication transport failed.' : 'Request failed',
  );
}

/** Keeps authentication material out of HTTP diagnostics; credentials remain with the caller. @internal */
export function protectRequestErrors(
  fetch: Fetch = globalThis.fetch,
  sensitive = false,
  ownedSecrets: () => Iterable<string> = () => [],
): Fetch {
  return async (input, init) => {
    const request =
      input instanceof Request && init === undefined
        ? input
        : new Request(input, init);
    const secrets = new Set(ownedSecrets());
    for (const [key, value] of request.headers) {
      if (/authorization|api.?key|passphrase|signature|secret/i.test(key)) {
        secrets.add(value);
        if (/^Bearer /i.test(value)) secrets.add(value.slice(7));
      }
    }
    if (request.body !== null) {
      const collect = (value: unknown): void => {
        if (value === null || typeof value !== 'object') return;
        for (const [key, field] of Object.entries(value)) {
          if (
            typeof field === 'string' &&
            /token|secret|passphrase|signature|api.?key|^key$/i.test(key)
          )
            secrets.add(field);
          else collect(field);
        }
      };
      await request
        .clone()
        .json()
        .then(collect, () => undefined);
    }
    const authentication =
      sensitive || new URL(request.url).pathname.includes('/v1/auth/');
    try {
      const response = await fetch(request);
      if (response.ok) return response;
      const text = await response.clone().text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
      const code =
        body !== null &&
        typeof body === 'object' &&
        'code' in body &&
        typeof body.code === 'string' &&
        /^[a-z][a-z0-9_]*$/.test(body.code) &&
        redact(body.code, secrets) === body.code
          ? body.code
          : undefined;
      let message = redact(text, secrets);
      if (
        !authentication &&
        body !== null &&
        typeof body === 'object' &&
        'code' in body &&
        typeof body.code === 'string' &&
        redact(body.code, secrets) !== body.code
      )
        message = redact(JSON.stringify({ ...body, code: undefined }), secrets);
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      if (authentication) headers.set('content-type', 'application/json');
      const result = authentication
        ? Response.json(
            { message: 'Authentication request rejected.', code },
            {
              status: response.status,
              statusText: response.statusText,
              headers,
            },
          )
        : new Response(message, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
      Object.defineProperty(result, 'url', { value: response.url });
      return result;
    } catch (error) {
      throw redactRequestError(error, secrets, authentication);
    }
  };
}
