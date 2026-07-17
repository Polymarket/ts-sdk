import { OrderSide } from '@polymarket/bindings';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BaseSecureClient } from '../../clients';
import { UserInputError } from '../../errors';
import { PrepareLimitOrderParamsSchema, prepareLimitOrderDraft } from './limit';

vi.mock('../clob', () => ({
  fetchTickSize: vi.fn(async () => 0.005),
  fetchNegRisk: vi.fn(async () => false),
}));

const FAKE_CLIENT = {
  account: {
    signer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    wallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  },
  environment: {
    chainId: 137,
    contracts: {
      standardExchange: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
      negRiskExchange: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
    },
  },
} as unknown as BaseSecureClient;

describe('prepareLimitOrderDraft tick conformance', () => {
  // Off-grid prices within the tick's decimal allowance would be signed and
  // then rejected by the exchange; they must fail client-side instead.
  it('rejects a price that is not a multiple of a 0.005 tick', async () => {
    const params = PrepareLimitOrderParamsSchema.parse({
      price: 0.007,
      side: OrderSide.BUY,
      size: 10,
      tokenId: '123',
    });

    await expect(prepareLimitOrderDraft(FAKE_CLIENT, params)).rejects.toThrow(
      UserInputError,
    );
  });

  it('accepts a price on the 0.005 tick grid', async () => {
    const params = PrepareLimitOrderParamsSchema.parse({
      price: 0.015,
      side: OrderSide.BUY,
      size: 10,
      tokenId: '123',
    });

    const draft = await prepareLimitOrderDraft(FAKE_CLIENT, params);

    expect(draft.tokenId).toBe('123');
  });
});

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
