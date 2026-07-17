import { TxHashSchema } from '@polymarket/bindings';
import {
  type AcceptedOrderResponse,
  type ClobTrade,
  OrderPostStatus,
} from '@polymarket/bindings/clob';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BaseSecureClient } from '../../clients';
import { TimeoutError, TransactionFailedError } from '../../errors';

// The action polls trades through `listAccountTrades`; mocking that module
// isolates the settlement loop, which is the boundary under test.
vi.mock('../account', () => ({ listAccountTrades: vi.fn() }));

const { listAccountTrades } = vi.mocked(await import('../account'));
const { waitForOrderSettlement } = await import('./settlement');

const client = {} as BaseSecureClient;

function makeOrderResponse(
  overrides: Partial<AcceptedOrderResponse> = {},
): AcceptedOrderResponse {
  return {
    makingAmount: '50',
    ok: true,
    orderId: '0xorder',
    status: OrderPostStatus.MATCHED,
    takingAmount: '100',
    tradeIds: [],
    transactionsHashes: [],
    ...overrides,
  } as AcceptedOrderResponse;
}

function makeTrade(overrides: Partial<ClobTrade> = {}): ClobTrade {
  return {
    bucketIndex: 0,
    feeRateBps: '0',
    id: 'trade-1',
    makerAddress: '0xmaker',
    makerOrders: [],
    market: '0xmarket',
    matchedAt: '2026-07-16T00:00:00.000Z',
    outcome: 'YES',
    owner: 'owner',
    price: '0.5',
    side: 'BUY',
    size: '100',
    status: 'MATCHED',
    takerOrderId: '0xorder',
    tokenId: '123',
    traderSide: 'TAKER',
    transactionHash: '',
    updatedAt: '2026-07-16T00:00:00.000Z',
    ...overrides,
  } as ClobTrade;
}

function mockTradesPages(...pages: ClobTrade[][]) {
  for (const items of pages) {
    listAccountTrades.mockReturnValueOnce({
      firstPage: async () => ({ hasMore: false, items }),
    } as ReturnType<typeof listAccountTrades>);
  }
}

const TX_HASH =
  '0x1111111111111111111111111111111111111111111111111111111111111111';
const OTHER_TX_HASH =
  '0x2222222222222222222222222222222222222222222222222222222222222222';

afterEach(() => {
  listAccountTrades.mockReset();
});

describe('waitForOrderSettlement', () => {
  it('resolves immediately to an empty array when the order had no fills', async () => {
    const hashes = await waitForOrderSettlement(
      client,
      makeOrderResponse({ status: OrderPostStatus.LIVE }),
    );

    expect(hashes).toEqual([]);
    expect(listAccountTrades).not.toHaveBeenCalled();
  });

  it('returns hashes delivered with the order response without waiting', async () => {
    const hashes = await waitForOrderSettlement(
      client,
      makeOrderResponse({
        tradeIds: ['trade-1'],
        transactionsHashes: [TxHashSchema.parse(TX_HASH)],
      }),
    );

    expect(hashes).toEqual([TX_HASH]);
    expect(listAccountTrades).not.toHaveBeenCalled();
  });

  it('polls until every fill settles and returns the hashes', async () => {
    mockTradesPages(
      [makeTrade()],
      [makeTrade({ status: 'MINED', transactionHash: TX_HASH })],
    );

    const hashes = await waitForOrderSettlement(
      client,
      makeOrderResponse({ tradeIds: ['trade-1'] }),
    );

    expect(hashes).toEqual([TX_HASH]);
    expect(listAccountTrades).toHaveBeenCalledTimes(2);
    expect(listAccountTrades).toHaveBeenCalledWith(client, { id: 'trade-1' });
  });

  it('returns settled hashes when only some fills fail execution', async () => {
    mockTradesPages(
      [makeTrade({ id: 'trade-1', status: 'FAILED' })],
      [
        makeTrade({
          id: 'trade-2',
          status: 'CONFIRMED',
          transactionHash: OTHER_TX_HASH,
        }),
      ],
    );

    const hashes = await waitForOrderSettlement(
      client,
      makeOrderResponse({ tradeIds: ['trade-1', 'trade-2'] }),
    );

    expect(hashes).toEqual([OTHER_TX_HASH]);
  });

  it('throws TransactionFailedError when every fill fails execution', async () => {
    mockTradesPages([makeTrade({ status: 'FAILED' })]);

    await expect(
      waitForOrderSettlement(
        client,
        makeOrderResponse({ tradeIds: ['trade-1'] }),
      ),
    ).rejects.toThrow(TransactionFailedError);
  });

  it('throws TimeoutError when fills are still settling at the deadline', async () => {
    listAccountTrades.mockReturnValue({
      firstPage: async () => ({ hasMore: false, items: [makeTrade()] }),
    } as ReturnType<typeof listAccountTrades>);

    await expect(
      waitForOrderSettlement(
        client,
        makeOrderResponse({ tradeIds: ['trade-1'] }),
        { timeoutMs: 1 },
      ),
    ).rejects.toThrow(TimeoutError);
  });
});
