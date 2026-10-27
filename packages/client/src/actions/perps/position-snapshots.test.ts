import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPublicClient } from '../../clients';
import { production } from '../../environments';
import {
  RequestAbortedError,
  RequestRejectedError,
  UserInputError,
} from '../../errors';
import { ServiceClient } from '../../ServiceClient';
import {
  FetchPerpsPositionSnapshotsError,
  fetchOwnPerpsPositionSnapshots,
} from './position-snapshots';
import { FetchPerpsRegistrationError } from './registration';

const root = 'http://localhost:4087';
const address = '0x1111111111111111111111111111111111111111';
const server = setupServer();
const client = createPublicClient({
  environment: { ...production, perps: { ...production.perps, rest: root } },
});
const empty = { active: [], history: [], history_as_of_at: 0 };

describe('position snapshot HTTP boundary', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it.each([
    'registration',
    'snapshots',
  ] as const)('cancels %s through the public client before dispatch and during body consumption', async (operation) => {
    let requestCount = 0;
    let bodyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      bodyStarted = resolve;
    });
    let bodyController!: ReadableStreamDefaultController<Uint8Array>;
    const controlledClient = createPublicClient({
      environment: {
        ...production,
        perps: { ...production.perps, rest: root },
      },
      fetch: async () => {
        requestCount++;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            bodyController = controller;
            controller.enqueue(new TextEncoder().encode('{'));
            bodyStarted();
          },
        });
        return new Response(body, {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    function read(signal: AbortSignal) {
      return operation === 'registration'
        ? controlledClient.fetchPerpsRegistration({ address }, { signal })
        : controlledClient.fetchPerpsPositionSnapshots(
            { address, activeInstrumentIds: [7] },
            { signal },
          );
    }
    const guard =
      operation === 'registration'
        ? FetchPerpsRegistrationError
        : FetchPerpsPositionSnapshotsError;
    const controller = new AbortController();
    const reason = new Error('view disposed');
    controller.abort(reason);
    await expect(read(controller.signal)).rejects.toMatchObject({
      cause: reason,
    });
    expect(requestCount).toBe(0);

    const active = new AbortController();
    const request = read(active.signal);
    const rejected = expect(request).rejects.toMatchObject({ cause: reason });
    await started;
    active.abort(reason);
    await rejected;
    await request.catch((error: unknown) => {
      expect(error).toBeInstanceOf(RequestAbortedError);
      expect(guard.isError(error)).toBe(true);
    });
    expect(requestCount).toBe(1);
    bodyController.close();
  });

  it('dispatches public selection order and exact trade IDs without credentials', async () => {
    server.use(
      http.post(`${root}/v1/info/position-snapshots`, async ({ request }) => {
        expect(request.headers.has('POLYMARKET-PROXY')).toBe(false);
        expect(request.headers.has('POLYMARKET-SECRET')).toBe(false);
        expect(await request.json()).toEqual({
          address,
          active_instrument_ids: [9, 0],
          history_fills: [
            {
              instrument_id: 7,
              trade_id: '18446744073709551615',
              timestamp: 18446744073709,
            },
          ],
        });
        return HttpResponse.json(empty);
      }),
    );
    await client.fetchPerpsPositionSnapshots({
      address,
      activeInstrumentIds: [9, 0],
      historyFills: [
        {
          instrumentId: 7,
          tradeId: '18446744073709551615',
          timestamp: 18446744073709,
        },
      ],
    });
  });

  it('rejects invalid selections before dispatch', async () => {
    const fill = { instrumentId: 7, tradeId: '1', timestamp: 0 };
    for (const selection of [
      {},
      { activeInstrumentIds: [1, 1] },
      { activeInstrumentIds: Array.from({ length: 21 }, (_, i) => i) },
      { activeInstrumentIds: [-1] },
      { activeInstrumentIds: [4294967296] },
      { activeInstrumentIds: null },
      { historyFills: null },
      { historyFills: [fill, { ...fill, tradeId: '01', timestamp: 1 }] },
      { historyFills: Array(5).fill(fill) },
      ...['+1', 'abc', '18446744073709551616', '000000000000000000001'].map(
        (tradeId) => ({ historyFills: [{ ...fill, tradeId }] }),
      ),
      ...[-1, 0.5, 18446744073710].map((timestamp) => ({
        historyFills: [{ ...fill, timestamp }],
      })),
    ]) {
      // Runtime callers can bypass static validation.
      await expect(
        client.fetchPerpsPositionSnapshots({ address, ...selection } as never),
      ).rejects.toBeInstanceOf(UserInputError);
    }
  });

  it('resolves the authenticated owner rather than using the proxy, and propagates auth failures', async () => {
    const paths: string[] = [];
    const api = new ServiceClient({
      root,
      resolveHeaders: async () => ({
        'POLYMARKET-PROXY': 'proxy',
        'POLYMARKET-SECRET': 'secret',
      }),
    });
    server.use(
      http.get(`${root}/v1/account/credentials`, ({ request }) => {
        paths.push('credentials');
        expect(request.headers.get('POLYMARKET-SECRET')).toBe('secret');
        return HttpResponse.json({ address, keys: [] });
      }),
      http.post(`${root}/v1/info/position-snapshots`, async ({ request }) => {
        paths.push('snapshots');
        expect(await request.json()).toEqual({
          address,
          active_instrument_ids: [7],
        });
        expect(request.headers.get('POLYMARKET-PROXY')).toBe('proxy');
        return HttpResponse.json(empty);
      }),
    );
    await expect(
      fetchOwnPerpsPositionSnapshots(api, { activeInstrumentIds: [7] }),
    ).resolves.toMatchObject({ historyAsOfAt: 0 });
    expect(paths).toEqual(['credentials', 'snapshots']);
    await expect(
      fetchOwnPerpsPositionSnapshots(api, {
        address,
        activeInstrumentIds: [7],
      } as never),
    ).rejects.toBeInstanceOf(UserInputError);
    expect(paths).toHaveLength(2);
    server.use(
      http.get(`${root}/v1/account/credentials`, () =>
        HttpResponse.json({ error: 'invalid credentials' }, { status: 401 }),
      ),
    );
    await expect(
      fetchOwnPerpsPositionSnapshots(api, { activeInstrumentIds: [7] }),
    ).rejects.toBeInstanceOf(RequestRejectedError);
    expect(paths).toHaveLength(2);
  });
});
