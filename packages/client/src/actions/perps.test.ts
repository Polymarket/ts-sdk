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
import { z } from 'zod';
import { createPublicClient } from '../clients';
import { production } from '../environments';
import {
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
} from '../errors';
import type { RequestOptions } from '../request-options';
import {
  executePerpsCollateralTransfer,
  type PerpsCollateralTransfer,
  type PerpsCollateralTransferOperation,
  type SignedPerpsCollateralTransfer,
} from './perps/internal-transfer';

const server = setupServer();
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
    vi.useRealTimers();
  });

  afterAll(() => {
    server.close();
  });

  it('allows a public read to take more than ten seconds when timeout is omitted', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      return Response.json({ fee_schedule: [] });
    });
    const client = createPublicClient({ fetch });
    const result = client.fetchPerpsFees();
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(result).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('snapshots numeric and disabled timeouts at the public read boundary', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30_100));
      return Response.json({ fee_schedule: [] });
    });
    const client = createPublicClient({ fetch });
    const options: RequestOptions = { timeout: 20, retries: 0 };
    const timedOut = expect(
      client.fetchPerpsFees(options),
    ).rejects.toMatchObject({
      name: 'TransportError',
      cause: { name: 'TimeoutError' },
    });
    options.timeout = false;
    const disabled = client.fetchPerpsFees(options);
    await vi.advanceTimersByTimeAsync(30_100);
    await timedOut;
    await expect(disabled).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    [20, 15],
    [false, 30_100],
    [undefined, 20_000],
  ] as const)('retains the snapshotted timeout=%s for every public pagination request', async (timeout, delay) => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const start = new URL(new Request(input).url).searchParams.get(
        'start_timestamp',
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return Response.json(
        start === '0'
          ? { data: [candle(1000), candle(61_000)], more: true }
          : { data: [candle(121_000)], more: false },
      );
    });
    const client = createPublicClient({ fetch });
    const options: RequestOptions = { timeout, retries: 0 };
    const pages = client.listPerpsCandles(
      {
        end: 300_000,
        instrumentId: 1,
        interval: PerpsKlineInterval.OneMinute,
        start: 0,
      },
      options,
    );
    options.timeout = 1;
    const first = pages.firstPage();
    await vi.advanceTimersByTimeAsync(delay);
    const firstPage = await first;
    expect(firstPage.items.map((item) => item.timestamp)).toEqual([
      1000, 61_000,
    ]);
    const continuation = (async () => {
      const timestamps: number[] = [];
      for await (const page of pages.from(firstPage.nextCursor)) {
        timestamps.push(...page.items.map((item) => item.timestamp));
      }
      return timestamps;
    })();
    await vi.advanceTimersByTimeAsync(delay);
    expect(await continuation).toEqual([121_000]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      fetch.mock.calls.map(([input]) =>
        new URL(new Request(input).url).searchParams.get('start_timestamp'),
      ),
    ).toEqual(['0', '121000']);
  });

  it('rejects malformed fee schedules even when shared options include a schema', async () => {
    server.use(
      http.get(`${production.perps.rest}/v1/info/fees`, () =>
        HttpResponse.json({ feeSchedule: 'invalid fee table' }),
      ),
    );
    const client = createPublicClient();
    const options = {
      signal: new AbortController().signal,
      schema: z.object({ feeSchedule: z.string() }),
    };

    await expect(client.fetchPerpsFees(options)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });

  it('keeps fee parsing and cancellation when shared options request raw responses', async () => {
    server.use(
      http.get(`${production.perps.rest}/v1/info/fees`, () =>
        HttpResponse.json({ fee_schedule: [] }),
      ),
    );
    const client = createPublicClient();
    const controller = new AbortController();
    const options = {
      signal: controller.signal,
      responseType: 'raw' as const,
    };

    await expect(client.fetchPerpsFees(options)).resolves.toEqual([]);

    const reason = new Error('fee request no longer needed');
    controller.abort(reason);
    await expect(client.fetchPerpsFees(options)).rejects.toMatchObject({
      name: 'RequestAbortedError',
      cause: reason,
    });
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

function candle(timestamp: number) {
  return [timestamp, '1', '2', '0.5', '1.5', '10', 1];
}
