import { OrderSide } from '@polymarket/bindings';
import { expectEvmAddress, okAsync } from '@polymarket/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BaseSecureClient } from '../../clients';
import { forkEnvironmentConfig } from '../../environments';
import { PrepareLimitOrderParamsSchema, prepareLimitOrderDraft } from './limit';

describe('PrepareLimitOrderParamsSchema', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a GTD expiration exactly 3 minutes in the future', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    expect(
      PrepareLimitOrderParamsSchema.safeParse({
        expiration: Math.floor(Date.now() / 1000) + 180,
        price: 0.52,
        side: OrderSide.BUY,
        size: 10,
        tokenId: '123',
      }).success,
    ).toBe(true);
  });

  it('rejects a GTD expiration less than 3 minutes in the future', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    expect(
      PrepareLimitOrderParamsSchema.safeParse({
        expiration: Math.floor(Date.now() / 1000) + 179,
        price: 0.52,
        side: OrderSide.BUY,
        size: 10,
        tokenId: '123',
      }).success,
    ).toBe(false);
  });
});

describe('prepareLimitOrderDraft', () => {
  it('resolves market metadata once across repeated drafts', async () => {
    const { client, requests, totalRequests } = createClient();
    const params = PrepareLimitOrderParamsSchema.parse({
      price: 0.52,
      side: OrderSide.BUY,
      size: 10,
      tokenId: TOKEN_ID,
    });

    const first = await prepareLimitOrderDraft(client, params);
    const second = await prepareLimitOrderDraft(client, params);

    expect(first).toEqual(second);
    expect(first.exchangeAddress).toBe(
      client.environment.contracts.negRiskExchange,
    );
    expect(requests(`/markets-by-token/${TOKEN_ID}`)).toBe(1);
    expect(requests(`/clob-markets/${CONDITION_ID}`)).toBe(1);
    expect(requests('/tick-size')).toBe(0);
    expect(requests('/neg-risk')).toBe(0);
    expect(totalRequests()).toBe(2);
  });
});

const TOKEN_ID = '111';
const CONDITION_ID = `0x${'ab'.repeat(32)}`;

function createClient() {
  const clobGet = vi.fn((path: string) => {
    if (path === `/markets-by-token/${TOKEN_ID}`) {
      return okAsync(jsonResponse({ condition_id: CONDITION_ID }));
    }

    if (path === `/clob-markets/${CONDITION_ID}`) {
      return okAsync(
        jsonResponse({
          mts: 0.01,
          nr: true,
          t: [
            { t: TOKEN_ID, o: 'Yes' },
            { t: '222', o: 'No' },
          ],
        }),
      );
    }

    throw new Error(`Unexpected request path: ${path}`);
  });

  const client = {
    account: {
      signer: expectEvmAddress('0x1111111111111111111111111111111111111111'),
      wallet: expectEvmAddress('0x2222222222222222222222222222222222222222'),
    },
    clob: { get: clobGet },
    environment: forkEnvironmentConfig({ name: 'test' }),
  } as unknown as BaseSecureClient;

  return {
    client,
    requests(prefix: string): number {
      return clobGet.mock.calls.filter(([path]) => path.startsWith(prefix))
        .length;
    },
    totalRequests(): number {
      return clobGet.mock.calls.length;
    },
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}
