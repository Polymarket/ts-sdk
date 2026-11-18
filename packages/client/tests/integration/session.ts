import type { EnvironmentConfig, Signer } from '@polymarket/client';
import { expect, type MockInstance } from 'vitest';

export type SentRequest = { headers: Headers; url: URL };

/** Lists the requests a `fetch` spy observed, in order. */
export function sentRequests(spy: MockInstance<typeof fetch>): SentRequest[] {
  return spy.mock.calls.map(([input, init]) =>
    input instanceof Request
      ? { headers: input.headers, url: new URL(input.url) }
      : { headers: new Headers(init?.headers), url: new URL(String(input)) },
  );
}

/** Lists one header of every observed request whose path ends with `path`. */
export function headerValues(
  requests: SentRequest[],
  path: string,
  header: string,
): (string | null)[] {
  return requests
    .filter((request) => request.url.pathname.endsWith(path))
    .map((request) => request.headers.get(header));
}

/** Reads the application ID that a session's access token is attributed to. */
export function clientIdOf(accessToken: string): unknown {
  return accessTokenPayload(accessToken).client_id;
}

/** Reads the lowercased wallet bound to a session's access token, if any. */
export function walletClaim(accessToken: string): string | undefined {
  const wallet = accessTokenPayload(accessToken).wallet as string | undefined;
  return wallet?.toLowerCase();
}

/**
 * Obtains L2 credentials for the signer directly from the trading service.
 * The SDK no longer manages these credentials, so migration tests set them up themselves.
 */
export async function obtainL2Credentials(
  environment: EnvironmentConfig,
  signer: Signer,
  nonce: number,
): Promise<{ key: string; secret: string; passphrase: string }> {
  const address = await signer.getAddress();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await signer.signTypedData({
    domain: {
      name: 'ClobAuthDomain',
      version: '1',
      chainId: environment.chainId,
    },
    primaryType: 'ClobAuth',
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
      ],
      ClobAuth: [
        { name: 'address', type: 'address' },
        { name: 'timestamp', type: 'string' },
        { name: 'nonce', type: 'uint256' },
        { name: 'message', type: 'string' },
      ],
    },
    message: {
      address,
      timestamp,
      nonce,
      message: 'This message attests that I control the given wallet',
    },
  });
  const headers = {
    POLY_ADDRESS: address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: timestamp,
    POLY_NONCE: String(nonce),
  };
  let response = await fetch(`${environment.clob.rest}/auth/api-key`, {
    method: 'POST',
    headers,
  });
  if (!response.ok)
    response = await fetch(`${environment.clob.rest}/auth/derive-api-key`, {
      headers,
    });
  expect(response.ok).toBe(true);
  const body = (await response.json()) as {
    apiKey: string;
    secret: string;
    passphrase: string;
  };
  return { key: body.apiKey, secret: body.secret, passphrase: body.passphrase };
}

function accessTokenPayload(accessToken: string): Record<string, unknown> {
  const [, payload = ''] = accessToken.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString());
}
