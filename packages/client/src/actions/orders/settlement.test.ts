import { TradeStatus, TxHashSchema, toOrderId } from '@polymarket/bindings';
import {
  type AcceptedOrderResponse,
  type ClobTrade,
  ClobTradeSchema,
  OrderPostStatus,
} from '@polymarket/bindings/clob';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BaseSecureClient } from '../../clients';
import { TimeoutError, TransactionFailedError } from '../../errors';

// The action polls trades through `listAccountTrades`; mocking that module
// isolates the settlement loop, which is the boundary under test.
vi.mock('../account', () => ({ listAccountTrades: vi.fn() }));

const { listAccountTrades } = vi.mocked(await import('../account'));
const { waitForOrderFillSettlement } = await import('./settlement');

const client = {} as BaseSecureClient;

function makeOrderResponse(
  overrides: Partial<AcceptedOrderResponse> = {},
): AcceptedOrderResponse {
  return {
    makingAmount: '50',
    ok: true,
    orderId: toOrderId('0xorder'),
    status: OrderPostStatus.MATCHED,
    takingAmount: '100',
    tradeIds: [],
    transactionsHashes: [],
    ...overrides,
  } as AcceptedOrderResponse;
}

type MakeTradeOverrides = {
  id?: string;
  status?: TradeStatus;
  transactionHash?: string;
};

// Trades are built from the wire payload through `ClobTradeSchema` so the
// factory stays aligned with the real boundary shape, including branded
// fields, as the schema evolves.
function makeTrade(overrides: MakeTradeOverrides = {}): ClobTrade {
  return ClobTradeSchema.parse({
    asset_id: '123',
    bucket_index: 0,
    fee_rate_bps: '0',
    id: overrides.id ?? 'trade-1',
    last_update: '1752500000',
    maker_address: '0xmaker',
    maker_orders: [],
    market:
      '0x00000000000000000000000000000000000000000000000000000000000000a1',
    match_time: '1752500000',
    outcome: 'YES',
    owner: 'owner',
    price: '0.5',
    side: 'BUY',
    size: '100',
    status: overrides.status ?? TradeStatus.Matched,
    taker_order_id: '0xorder',
    trader_side: 'TAKER',
    transaction_hash: overrides.transactionHash ?? '',
  });
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

describe('waitForOrderFillSettlement', () => {
  it('resolves immediately to an empty array when the order had no fills', async () => {
    const hashes = await waitForOrderFillSettlement(
      client,
      makeOrderResponse({ status: OrderPostStatus.LIVE }),
    );

    expect(hashes).toEqual([]);
    expect(listAccountTrades).not.toHaveBeenCalled();
  });

  it('returns hashes delivered with the order response when there are no trade ids to poll', async () => {
    const hashes = await waitForOrderFillSettlement(
      client,
      makeOrderResponse({
        transactionsHashes: [TxHashSchema.parse(TX_HASH)],
      }),
    );

    expect(hashes).toEqual([TX_HASH]);
    expect(listAccountTrades).not.toHaveBeenCalled();
  });

  it('polls trade ids even when the order response includes hashes', async () => {
    mockTradesPages([
      makeTrade({ status: TradeStatus.Confirmed, transactionHash: TX_HASH }),
    ]);

    const hashes = await waitForOrderFillSettlement(
      client,
      makeOrderResponse({
        tradeIds: ['trade-1'],
        transactionsHashes: [TxHashSchema.parse(OTHER_TX_HASH)],
      }),
    );

    expect(hashes).toEqual([TX_HASH]);
    expect(listAccountTrades).toHaveBeenCalledWith(client, { id: 'trade-1' });
  });

  it('polls until every fill confirms and returns the hashes', async () => {
    mockTradesPages(
      // A hash before confirmation is not terminal: it can still be
      // replaced if the transaction is retried.
      [
        makeTrade({
          status: TradeStatus.Mined,
          transactionHash: OTHER_TX_HASH,
        }),
      ],
      [makeTrade({ status: TradeStatus.Confirmed, transactionHash: TX_HASH })],
    );

    const hashes = await waitForOrderFillSettlement(
      client,
      makeOrderResponse({ tradeIds: ['trade-1'] }),
    );

    expect(hashes).toEqual([TX_HASH]);
    expect(listAccountTrades).toHaveBeenCalledTimes(2);
    expect(listAccountTrades).toHaveBeenCalledWith(client, { id: 'trade-1' });
  });

  it('returns settled hashes when only some fills fail execution', async () => {
    mockTradesPages(
      [makeTrade({ id: 'trade-1', status: TradeStatus.Failed })],
      [
        makeTrade({
          id: 'trade-2',
          status: TradeStatus.Confirmed,
          transactionHash: OTHER_TX_HASH,
        }),
      ],
    );

    const hashes = await waitForOrderFillSettlement(
      client,
      makeOrderResponse({ tradeIds: ['trade-1', 'trade-2'] }),
    );

    expect(hashes).toEqual([OTHER_TX_HASH]);
  });

  it('throws TransactionFailedError when every fill fails execution', async () => {
    mockTradesPages([makeTrade({ status: TradeStatus.Failed })]);

    await expect(
      waitForOrderFillSettlement(
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
      waitForOrderFillSettlement(
        client,
        makeOrderResponse({ tradeIds: ['trade-1'] }),
        { timeoutMs: 1 },
      ),
    ).rejects.toThrow(TimeoutError);
  });
});
