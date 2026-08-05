import { OrderSide, OrderType, toTokenId } from '@polymarket/bindings';
import type { EvmAddress } from '@polymarket/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BaseSecureClient } from '../../clients';

const fetchTickSize = vi.fn(async () => 0.01 as const);
const fetchNegRisk = vi.fn(async () => false);

vi.mock('../clob', () => ({
  fetchTickSize,
  fetchNegRisk,
  fetchBuilderFeeRates: vi.fn(),
  fetchMarketInfo: vi.fn(),
  resolveConditionByToken: vi.fn(),
}));

// Imported after the mock so the modules pick up the mocked `../clob`.
const { prepareLimitOrderDraft } = await import('./limit');
const { prepareMarketOrderDraft } = await import('./market');

const STANDARD_EXCHANGE =
  '0x0000000000000000000000000000000000000010' as EvmAddress;
const NEG_RISK_EXCHANGE =
  '0x0000000000000000000000000000000000000020' as EvmAddress;
const SIGNER = '0x0000000000000000000000000000000000000001' as EvmAddress;
const WALLET = '0x0000000000000000000000000000000000000002' as EvmAddress;
const TOKEN_ID = toTokenId('123');

function createClient(): BaseSecureClient {
  return {
    account: { signer: SIGNER, wallet: WALLET },
    environment: {
      chainId: 137,
      contracts: {
        standardExchange: STANDARD_EXCHANGE,
        negRiskExchange: NEG_RISK_EXCHANGE,
      },
    },
  } as unknown as BaseSecureClient;
}

describe('prepare order context fetch skipping', () => {
  afterEach(() => {
    fetchTickSize.mockClear();
    fetchNegRisk.mockClear();
  });

  describe('prepareLimitOrderDraft', () => {
    it('skips both fetches when tickSize and negRisk are supplied', async () => {
      const draft = await prepareLimitOrderDraft(createClient(), {
        negRisk: false,
        postOnly: false,
        price: 0.52,
        side: OrderSide.BUY,
        size: 10,
        tickSize: 0.01,
        tokenId: TOKEN_ID,
      });

      expect(fetchTickSize).not.toHaveBeenCalled();
      expect(fetchNegRisk).not.toHaveBeenCalled();
      expect(draft.exchangeAddress).toBe(STANDARD_EXCHANGE);
    });

    it('honours a supplied negRisk=true by selecting the neg-risk exchange', async () => {
      const draft = await prepareLimitOrderDraft(createClient(), {
        negRisk: true,
        postOnly: false,
        price: 0.52,
        side: OrderSide.BUY,
        size: 10,
        tickSize: 0.01,
        tokenId: TOKEN_ID,
      });

      expect(fetchNegRisk).not.toHaveBeenCalled();
      expect(draft.exchangeAddress).toBe(NEG_RISK_EXCHANGE);
    });

    it('fetches only the missing value when one override is supplied', async () => {
      await prepareLimitOrderDraft(createClient(), {
        postOnly: false,
        price: 0.52,
        side: OrderSide.BUY,
        size: 10,
        tickSize: 0.01,
        tokenId: TOKEN_ID,
      });

      expect(fetchTickSize).not.toHaveBeenCalled();
      expect(fetchNegRisk).toHaveBeenCalledTimes(1);
    });

    it('fetches both values when neither override is supplied', async () => {
      await prepareLimitOrderDraft(createClient(), {
        postOnly: false,
        price: 0.52,
        side: OrderSide.BUY,
        size: 10,
        tokenId: TOKEN_ID,
      });

      expect(fetchTickSize).toHaveBeenCalledTimes(1);
      expect(fetchNegRisk).toHaveBeenCalledTimes(1);
    });
  });

  describe('prepareMarketOrderDraft', () => {
    it('skips both fetches when tickSize and negRisk are supplied', async () => {
      const draft = await prepareMarketOrderDraft(createClient(), {
        amount: 10,
        maxPrice: 0.55,
        negRisk: false,
        orderType: OrderType.FAK,
        side: OrderSide.BUY,
        tickSize: 0.01,
        tokenId: TOKEN_ID,
      });

      expect(fetchTickSize).not.toHaveBeenCalled();
      expect(fetchNegRisk).not.toHaveBeenCalled();
      expect(draft.exchangeAddress).toBe(STANDARD_EXCHANGE);
    });

    it('fetches only the missing value when one override is supplied', async () => {
      await prepareMarketOrderDraft(createClient(), {
        amount: 10,
        maxPrice: 0.55,
        negRisk: true,
        orderType: OrderType.FAK,
        side: OrderSide.BUY,
        tokenId: TOKEN_ID,
      });

      expect(fetchTickSize).toHaveBeenCalledTimes(1);
      expect(fetchNegRisk).not.toHaveBeenCalled();
    });
  });
});
