import { describe, expectTypeOf, it } from 'vitest';
import type { PublicClient, SecureClient } from './clients';
import type { RequestOptions } from './request-options';

describe('per-read timeout options', () => {
  it('accepts milliseconds or false alongside cancellation', () => {
    expectTypeOf({ timeout: 30_000 }).toExtend<RequestOptions>();
    expectTypeOf({ timeout: false as const }).toExtend<RequestOptions>();
    expectTypeOf({
      signal: new AbortController().signal,
      timeout: 500,
      retries: 0,
    }).toExtend<RequestOptions>();
    // @ts-expect-error Only false disables the timeout.
    const invalidBoolean: RequestOptions = { timeout: true };
    // @ts-expect-error Timeout values are milliseconds, not strings.
    const invalidString: RequestOptions = { timeout: '30s' };
    void invalidBoolean;
    void invalidString;
  });
});

function publicReads(client: PublicClient) {
  client.fetchOrderBook({ assetId: '123' }, { timeout: 30_000 });
  client.listTrades({ pageSize: 1 }, { timeout: false }).firstPage();
  client.listSports({ timeout: 500, signal: new AbortController().signal });
  client.fetchPerpsRegistration(
    { address: '0x0000000000000000000000000000000000000001' },
    { timeout: 500 },
  );
}

function secureReads(client: SecureClient) {
  client.fetchNotifications({ timeout: false });
  client.listPositions(undefined, { timeout: 30_000 }).firstPage();
}
void publicReads;
void secureReads;
