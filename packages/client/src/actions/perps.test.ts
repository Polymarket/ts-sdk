import {
  PerpsInternalTransferIdSchema,
  PerpsKlineInterval,
} from '@polymarket/bindings/perps';
import { expectEvmAddress, expectEvmSignature } from '@polymarket/types';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { BaseClient } from '../clients';
import { RequestRejectedError, SigningError, TransportError } from '../errors';
import { ServiceClient } from '../ServiceClient';
import {
  listPerpsCandles,
  listPerpsFundingHistory,
  listPerpsTrades,
} from './perps';
import {
  executePerpsCollateralTransfer,
  type PerpsCollateralTransfer,
  type PerpsCollateralTransferOperation,
  type SignedPerpsCollateralTransfer,
} from './perps/internal-transfer';

const root = 'http://localhost:4017';
const server = setupServer();
const txHash = `0x${'1'.repeat(64)}`;
const signerAddress = expectEvmAddress(
  '0x0000000000000000000000000000000000000001',
);
const recipientAddress = expectEvmAddress(
  '0x0000000000000000000000000000000000000002',
);
const signature = expectEvmSignature(`0x${'1'.repeat(130)}`);
const transferId = PerpsInternalTransferIdSchema.parse(42);
const transfer: PerpsCollateralTransfer = {
  account: signerAddress,
  token: expectEvmAddress('0x0000000000000000000000000000000000000003'),
  recipient: recipientAddress,
  amount: '100.00',
  label: 'treasury-rebalance-42',
  salt: 123,
  timestamp: 1_789_704_000_000,
};

describe('Perps actions', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('continues candle pages from the next interval boundary', async () => {
    const requests: URLSearchParams[] = [];
    server.use(
      http.get(`${root}/v1/info/klines`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        requests.push(params);

        if (params.get('start_timestamp') === '0') {
          return HttpResponse.json({
            data: [candle(1000), candle(61_000)],
            more: true,
          });
        }

        return HttpResponse.json({
          data: [candle(121_000)],
          more: false,
        });
      }),
    );
    const pages = listPerpsCandles(createClient(), {
      end: 300_000,
      instrumentId: 1,
      interval: PerpsKlineInterval.OneMinute,
      start: 0,
    });

    const first = await pages.firstPage();
    const second = await pages.from(first.nextCursor).firstPage();

    expect(first.items.map((item) => item.timestamp)).toEqual([1000, 61_000]);
    expect(second.items.map((item) => item.timestamp)).toEqual([121_000]);
    expect(requests.map((params) => params.get('start_timestamp'))).toEqual([
      '0',
      '121000',
    ]);
    expect(requests.map((params) => params.get('end_timestamp'))).toEqual([
      '300000',
      '300000',
    ]);
  });

  it('continues funding pages before the last returned timestamp', async () => {
    const requests: URLSearchParams[] = [];
    server.use(
      http.get(`${root}/v1/info/funding`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        requests.push(params);

        if (params.get('end_timestamp') === '3000') {
          return HttpResponse.json({
            data: [funding(3000), funding(2000)],
            more: true,
          });
        }

        return HttpResponse.json({
          data: [funding(1000)],
          more: false,
        });
      }),
    );
    const pages = listPerpsFundingHistory(createClient(), {
      end: 3000,
      instrumentId: 1,
      start: 0,
    });

    const first = await pages.firstPage();
    const second = await pages.from(first.nextCursor).firstPage();

    expect(first.items.map((item) => item.timestamp)).toEqual([3000, 2000]);
    expect(second.items.map((item) => item.timestamp)).toEqual([1000]);
    expect(requests.map((params) => params.get('end_timestamp'))).toEqual([
      '3000',
      '1999',
    ]);
  });

  it('overlaps and dedupes trade pages with shared timestamps', async () => {
    const requests: URLSearchParams[] = [];
    server.use(
      http.get(`${root}/v1/info/trades`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        requests.push(params);

        if (params.get('end_timestamp') === '3000') {
          return HttpResponse.json({
            data: [trade(1, 3000), trade(2, 2000)],
            more: true,
          });
        }

        return HttpResponse.json({
          data: [trade(2, 2000), trade(3, 2000), trade(4, 1000)],
          more: false,
        });
      }),
    );
    const pages = listPerpsTrades(createClient(), {
      end: 3000,
      instrumentId: 1,
      start: 0,
    });

    const first = await pages.firstPage();
    const second = await pages.from(first.nextCursor).firstPage();

    expect(first.items.map((item) => item.tradeId)).toEqual([1, 2]);
    expect(second.items.map((item) => item.tradeId)).toEqual([3, 4]);
    expect(requests.map((params) => params.get('end_timestamp'))).toEqual([
      '3000',
      '2000',
    ]);
  });

  it('continues trade pagination after a fully deduped boundary page', async () => {
    const requests: URLSearchParams[] = [];
    server.use(
      http.get(`${root}/v1/info/trades`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        requests.push(params);

        if (params.get('end_timestamp') === '3000') {
          return HttpResponse.json({
            data: [trade(1, 3000), trade(2, 2000)],
            more: true,
          });
        }

        if (params.get('end_timestamp') === '2000') {
          return HttpResponse.json({
            data: [trade(2, 2000)],
            more: true,
          });
        }

        return HttpResponse.json({
          data: [trade(3, 1000)],
          more: false,
        });
      }),
    );
    const pages = listPerpsTrades(createClient(), {
      end: 3000,
      instrumentId: 1,
      start: 0,
    });

    const first = await pages.firstPage();
    const second = await pages.from(first.nextCursor).firstPage();
    const third = await pages.from(second.nextCursor).firstPage();

    expect(first.items.map((item) => item.tradeId)).toEqual([1, 2]);
    expect(second.items).toEqual([]);
    expect(second.hasMore).toBe(true);
    expect(third.items.map((item) => item.tradeId)).toEqual([3]);
    expect(requests.map((params) => params.get('end_timestamp'))).toEqual([
      '3000',
      '2000',
      '1999',
    ]);
  });

  it('signs and submits the exact transfer once, keeping the label unsigned', async () => {
    const { label, ...operation } = transfer;
    const calls: string[] = [];
    const signTransfer = vi.fn(
      async (request: PerpsCollateralTransferOperation) => {
        calls.push('sign');
        expect(request).toEqual(operation);
        return signature;
      },
    );
    const submitTransfer = vi.fn(
      async (request: SignedPerpsCollateralTransfer) => {
        calls.push('submit');
        expect(request).toEqual({ ...operation, label, signature });
        return transferId;
      },
    );

    await expect(
      executePerpsCollateralTransfer(
        { signTransfer, submitTransfer },
        transfer,
      ),
    ).resolves.toBe(transferId);
    expect(signTransfer).toHaveBeenCalledTimes(1);
    expect(submitTransfer).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['sign', 'submit']);
  });

  it('does not submit when transfer signing fails', async () => {
    const error = new SigningError('Signing declined.');
    const signTransfer = vi.fn(async () => {
      throw error;
    });
    const submitTransfer = vi.fn(async () => transferId);

    await expect(
      executePerpsCollateralTransfer(
        { signTransfer, submitTransfer },
        transfer,
      ),
    ).rejects.toBe(error);
    expect(signTransfer).toHaveBeenCalledTimes(1);
    expect(submitTransfer).not.toHaveBeenCalled();
  });

  it.each([
    new RequestRejectedError('Owner signing rejected.', {
      code: 'signer_does_not_match_account',
      status: 422,
    }),
    new RequestRejectedError('Unknown transfer outcome.', { status: 500 }),
    new TransportError('Connection lost after submission.'),
  ])('does not retry a transfer after $name ($message)', async (error) => {
    const signTransfer = vi.fn(async () => signature);
    const submitTransfer = vi.fn(async () => {
      throw error;
    });

    await expect(
      executePerpsCollateralTransfer(
        { signTransfer, submitTransfer },
        transfer,
      ),
    ).rejects.toBe(error);
    expect(signTransfer).toHaveBeenCalledTimes(1);
    expect(submitTransfer).toHaveBeenCalledTimes(1);
  });
});

function createClient(): BaseClient {
  return {
    perps: new ServiceClient({ root }),
  } as unknown as BaseClient;
}

function candle(timestamp: number) {
  return [timestamp, '1', '2', '0.5', '1.5', '10', 1];
}

function funding(timestamp: number) {
  return {
    funding_rate: '0.001',
    timestamp,
  };
}

function trade(tradeId: number, timestamp: number) {
  return {
    hash: txHash,
    instrument_id: 1,
    price: '1',
    quantity: '2',
    side: 'long',
    timestamp,
    trade_id: tradeId,
  };
}
