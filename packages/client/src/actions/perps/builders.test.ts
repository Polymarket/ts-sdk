import { ApiKeySchema } from '@polymarket/bindings';
import { expectEvmAddress, expectEvmSignature } from '@polymarket/types';
import { HttpResponse, http, ws } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createSecureClient } from '../../clients';
import { forkEnvironmentConfig } from '../../environments';
import type { Signer } from '../../types';

// Controlled server state is needed to exercise revoked versions, conflicts,
// and failed reads without changing a real account's fee consent.
const root = 'http://localhost:4091';
const socket = ws.link('ws://localhost:4091/ws');
const server = setupServer();
const owner = expectEvmAddress('0x1111111111111111111111111111111111111111');
const builder = '0x2222222222222222222222222222222222222222';
const sessionBuilder = '0x3333333333333333333333333333333333333333';
const credentials = {
  key: ApiKeySchema.parse('key'),
  passphrase: 'passphrase',
  secret: 'secret',
};
const environment = forkEnvironmentConfig({
  name: 'test',
  clob: { rest: root },
  perps: { rest: root, ws: 'ws://localhost:4091/ws' },
});
const signTypedData = vi.fn(async () =>
  expectEvmSignature(`0x${'11'.repeat(65)}`),
);
const signer: Signer = {
  getAddress: async () => owner,
  signTypedData,
  signMessage: async () => {
    throw new Error('Unexpected signMessage');
  },
  sendTransaction: async () => {
    throw new Error('Unexpected sendTransaction');
  },
};
let keys: { proxy: string; expiry: number }[];
let reads: number;
let submissions: {
  builder: string;
  max_fee_rate: string;
  approval_version: number;
}[];
let previousVersion: number | undefined;
let readStatus: number;
let submitStatus: number;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  keys = [];
  reads = 0;
  submissions = [];
  previousVersion = undefined;
  readStatus = 200;
  submitStatus = 200;
  signTypedData.mockClear();
  server.use(
    http.get(`${root}/auth/api-keys`, () =>
      HttpResponse.json({ apiKeys: [credentials.key] }),
    ),
    http.post(`${root}/v1/account/proxy`, async ({ request }) => {
      const body = (await request.json()) as {
        op: { args: { proxy: string; expiry: number } };
      };
      keys.push(body.op.args);
      return HttpResponse.json({ secret: 'perps-secret' });
    }),
    http.get(`${root}/v1/account/credentials`, () =>
      HttpResponse.json({ address: owner, keys }),
    ),
    socket.addEventListener('connection', ({ client }) => {
      client.addEventListener('message', ({ data }) => {
        const frame = JSON.parse(String(data));
        client.send(JSON.stringify({ id: frame.id, data: { status: 'ok' } }));
      });
    }),
    http.get(`${root}/v1/account/builder-approvals`, ({ request }) => {
      reads++;
      expect(request.headers.get('POLYMARKET-SECRET')).toBe('perps-secret');
      if (readStatus !== 200)
        return HttpResponse.json(
          { error: 'read failed' },
          { status: readStatus },
        );
      return HttpResponse.json({
        data:
          previousVersion === undefined
            ? []
            : [
                {
                  trader: owner,
                  builder: new URL(request.url).searchParams.get('builder'),
                  max_fee_rate: '0',
                  approval_version: previousVersion,
                  timestamp: Date.now(),
                  sequence: 1,
                },
              ],
      });
    }),
    http.post(`${root}/v1/account/builder-approvals`, async ({ request }) => {
      const body = (await request.json()) as {
        op: {
          args: {
            builder: string;
            max_fee_rate: string;
            approval_version: number;
          };
        };
      };
      submissions.push(body.op.args);
      if (submitStatus !== 200)
        return HttpResponse.json(
          { error: 'version conflict' },
          { status: submitStatus },
        );
      return HttpResponse.json({
        ...body.op.args,
        trader: owner,
        timestamp: Date.now(),
        sequence: 2,
      });
    }),
  );
});

async function createClient() {
  return createSecureClient({
    signer,
    wallet: owner,
    environment,
    credentials,
    perpsBuilderAttribution: { address: builder, feeRate: '0.0005' },
  });
}

describe('builder approval defaults', () => {
  it.each([
    undefined,
    7,
  ])('resolves client defaults and saved version %s, then closes the temporary connection', async (version) => {
    previousVersion = version;
    const client = await createClient();
    const approval = await client.approvePerpsBuilderFee();
    expect(approval).toMatchObject({
      builder,
      maxFeeRate: '0.0005',
      approvalVersion: (version ?? 0) + 1,
    });
    expect(reads).toBe(1);
    expect(submissions).toHaveLength(1);
    expect(signTypedData).toHaveBeenCalledTimes(2); // Delegate credentials, then owner consent.
    expect(keys[0]?.expiry).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(client.webSockets.perpsSession.getSession()).toBeUndefined();
  });

  it('uses session terms before client terms and lets explicit terms override either', async () => {
    const client = await createClient();
    const session = await client.openPerpsSession({
      builderAttribution: { address: sessionBuilder, feeRate: '0.0003' },
    });
    try {
      await expect(client.approvePerpsBuilderFee()).resolves.toMatchObject({
        builder: sessionBuilder,
        maxFeeRate: '0.0003',
      });
      await expect(
        client.approvePerpsBuilderFee({
          builder,
          maxFeeRate: '0',
          approvalVersion: 9,
        }),
      ).resolves.toMatchObject({
        builder,
        maxFeeRate: '0',
        approvalVersion: 9,
      });
      expect(reads).toBe(1);
      expect(session.closed).toBe(false);
    } finally {
      await session.close();
    }
  });

  it('requires session selection when multiple sessions are open', async () => {
    const client = await createClient();
    const first = await client.openPerpsSession();
    const second = await client.openPerpsSession({
      builderAttribution: { address: sessionBuilder, feeRate: '0.0003' },
    });
    try {
      await expect(client.approvePerpsBuilderFee()).rejects.toThrow(
        'Multiple Perps sessions',
      );
      expect(reads).toBe(0);
      await expect(
        client.approvePerpsBuilderFee({ session: second }),
      ).resolves.toMatchObject({ builder: sessionBuilder });
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });

  it('skips session creation and lookup for an explicit version', async () => {
    const client = await createClient();
    await client.approvePerpsBuilderFee({ approvalVersion: 4 });
    expect(keys).toHaveLength(0);
    expect(reads).toBe(0);
    expect(signTypedData).toHaveBeenCalledTimes(1);
  });

  it('does not sign approval after a failed lookup and closes the temporary connection', async () => {
    readStatus = 401;
    const client = await createClient();
    await expect(client.approvePerpsBuilderFee()).rejects.toThrow();
    expect(submissions).toHaveLength(0);
    expect(signTypedData).toHaveBeenCalledTimes(1);
    expect(client.webSockets.perpsSession.getSession()).toBeUndefined();
  });

  it('does not sign or submit again after a version conflict', async () => {
    submitStatus = 409;
    const client = await createClient();
    await expect(client.approvePerpsBuilderFee()).rejects.toThrow();
    expect(reads).toBe(1);
    expect(submissions).toHaveLength(1);
    expect(signTypedData).toHaveBeenCalledTimes(2);
  });
});
