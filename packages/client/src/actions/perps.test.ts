import { WalletType } from '@polymarket/bindings/gamma';
import { PerpsKlineInterval } from '@polymarket/bindings/perps';
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
import type { BaseClient, BaseSecureClient } from '../clients';
import { production } from '../environments';
import { RequestRejectedError, UserInputError } from '../errors';
import { ServiceClient } from '../ServiceClient';
import { SignerType } from '../wallet';
import { createPerpsOpTypedDataPayload } from '../websockets/perps/signing';
import {
  listPerpsCandles,
  listPerpsFundingHistory,
  listPerpsTrades,
  transferPerpsCollateral,
} from './perps';

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

  it('signs and sends an owner internal transfer with the exact decimal amount', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post(`${root}/v1/account/internal-transfer`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ status: 'ok', transfer_id: 42 });
      }),
    );
    const { client, signTypedData } = createSecureClient();

    await expect(
      transferPerpsCollateral(client, {
        amount: '100.00',
        label: 'treasury-rebalance-42',
        recipient: recipientAddress,
      }),
    ).resolves.toBe(42);

    expect(bodies).toHaveLength(1);
    const body = bodies[0] as { salt: number; ts: number };
    expect(body).toEqual({
      label: 'treasury-rebalance-42',
      op: {
        args: {
          account: signerAddress,
          amount: '100.00',
          to: recipientAddress,
          token: production.contracts.collateralToken,
        },
        type: 'internalTransfer',
      },
      salt: expect.any(Number),
      sig: signature,
      ts: expect.any(Number),
    });
    expect(signTypedData).toHaveBeenCalledWith(
      createPerpsOpTypedDataPayload({
        chainId: production.chainId,
        op: [
          'internalTransfer',
          [
            signerAddress,
            production.contracts.collateralToken,
            '100.00',
            recipientAddress,
          ],
        ],
        salt: body.salt,
        timestamp: body.ts,
      }),
    );
  });

  it('rejects session-key and self transfers before signing or transport', async () => {
    const sessionKeyClient = createSecureClient(SignerType.SESSION_KEY);
    await expect(
      transferPerpsCollateral(sessionKeyClient.client, {
        amount: '1',
        recipient: recipientAddress,
      }),
    ).rejects.toBeInstanceOf(UserInputError);
    expect(sessionKeyClient.signTypedData).not.toHaveBeenCalled();

    const ownerClient = createSecureClient();
    await expect(
      transferPerpsCollateral(ownerClient.client, {
        amount: '1',
        recipient: signerAddress,
      }),
    ).rejects.toBeInstanceOf(UserInputError);
    expect(ownerClient.signTypedData).not.toHaveBeenCalled();
  });

  it('surfaces owner-signing rejection identifiers', async () => {
    server.use(
      http.post(`${root}/v1/account/internal-transfer`, () =>
        HttpResponse.json(
          { status: 'err', error: 'signer_does_not_match_account' },
          { status: 422 },
        ),
      ),
    );

    await expect(
      transferPerpsCollateral(createSecureClient().client, {
        amount: '1',
        recipient: recipientAddress,
      }),
    ).rejects.toMatchObject({
      code: 'signer_does_not_match_account',
      name: RequestRejectedError.name,
      status: 422,
    });
  });

  it('attempts an internal transfer only once on an unknown outcome', async () => {
    let requests = 0;
    server.use(
      http.post(`${root}/v1/account/internal-transfer`, () => {
        requests += 1;
        return HttpResponse.json(
          { status: 'err', error: 'internal_error' },
          { status: 500 },
        );
      }),
    );

    await expect(
      transferPerpsCollateral(createSecureClient().client, {
        amount: '1',
        recipient: recipientAddress,
      }),
    ).rejects.toBeInstanceOf(RequestRejectedError);
    expect(requests).toBe(1);
  });
});

function createClient(): BaseClient {
  return {
    perps: new ServiceClient({ root }),
  } as unknown as BaseClient;
}

function createSecureClient(signerType: SignerType = SignerType.OWNER): {
  client: BaseSecureClient;
  signTypedData: ReturnType<typeof vi.fn>;
} {
  const signTypedData = vi.fn(async () => signature);
  const client = {
    account: {
      signer: signerAddress,
      signerType,
      wallet: signerAddress,
      walletType: WalletType.EOA,
    },
    environment: production,
    perps: new ServiceClient({ root }),
    signer: { signTypedData },
  } as unknown as BaseSecureClient;

  return { client, signTypedData };
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
