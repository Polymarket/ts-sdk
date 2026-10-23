import { TransportError } from './errors';
import type { Fetch } from './request-options';

/** Keeps authentication material out of transport diagnostics. @internal */
export function protectRequestErrors(
  fetch: Fetch = globalThis.fetch,
  sensitive = false,
): Fetch {
  return async (input, init) => {
    const request =
      input instanceof Request && init === undefined
        ? input
        : new Request(input, init);
    const secrets = new Set<string>();
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
    const redact = (value: string): string => {
      let result = value;
      for (const secret of [...secrets]
        .filter(Boolean)
        .sort((a, b) => b.length - a.length))
        result = result.replaceAll(secret, '[REDACTED]');
      return result;
    };
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
        /^[a-z][a-z0-9_]*$/.test(body.code)
          ? body.code
          : undefined;
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      if (sensitive) headers.set('content-type', 'application/json');
      const result = sensitive
        ? Response.json(
            { message: 'Authentication request rejected.', code },
            { status: response.status, headers },
          )
        : new Response(redact(text), { status: response.status, headers });
      Object.defineProperty(result, 'url', { value: response.url });
      return result;
    } catch (error) {
      if (sensitive && !(error instanceof TransportError))
        throw new TransportError('Authentication transport failed.');
      if (error instanceof Error && redact(error.message) !== error.message)
        throw new TransportError(redact(error.message));
      throw error;
    }
  };
}
