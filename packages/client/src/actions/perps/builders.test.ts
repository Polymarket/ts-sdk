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
  });
}

describe('builder approval defaults', () => {
  it.each([
    undefined,
    7,
  ])('uses session defaults and saved version %s', async (version) => {
    previousVersion = version;
    const client = await createClient();
    const session = await client.openPerpsSession({
      builderAttribution: { address: builder, feeRate: '0.0005' },
    });
    try {
      signTypedData.mockClear();
      const approval = await session.approveBuilderFee();
      expect(approval).toMatchObject({
        builder,
        maxFeeRate: '0.0005',
        approvalVersion: (version ?? 0) + 1,
      });
      expect(reads).toBe(1);
      expect(submissions).toHaveLength(1);
      expect(signTypedData).toHaveBeenCalledTimes(1);
      expect(session.closed).toBe(false);
    } finally {
      await session.close();
    }
  });

  it('requires explicit terms without session defaults and performs no approval side effects', async () => {
    const client = await createClient();
    const session = await client.openPerpsSession();
    try {
      signTypedData.mockClear();
      await expect(session.approveBuilderFee()).rejects.toMatchObject({
        name: 'UserInputError',
      });
      expect(reads).toBe(0);
      expect(submissions).toHaveLength(0);
      expect(signTypedData).not.toHaveBeenCalled();
    } finally {
      await session.close();
    }
  });

  it('lets explicit terms override session terms, including revocation', async () => {
    const client = await createClient();
    const session = await client.openPerpsSession({
      builderAttribution: { address: sessionBuilder, feeRate: '0.0003' },
    });
    try {
      await expect(
        session.approveBuilderFee({
          builder,
          maxFeeRate: '0',
          approvalVersion: 9,
        }),
      ).resolves.toMatchObject({
        builder,
        maxFeeRate: '0',
        approvalVersion: 9,
      });
      expect(reads).toBe(0);
    } finally {
      await session.close();
    }
  });

  it('uses the receiving session when multiple sessions are open', async () => {
    const client = await createClient();
    const first = await client.openPerpsSession({
      builderAttribution: { address: builder, feeRate: '0.0005' },
    });
    const second = await client.openPerpsSession({
      builderAttribution: { address: sessionBuilder, feeRate: '0.0003' },
    });
    try {
      await expect(first.approveBuilderFee()).resolves.toMatchObject({
        builder,
        maxFeeRate: '0.0005',
      });
      await expect(second.approveBuilderFee()).resolves.toMatchObject({
        builder: sessionBuilder,
        maxFeeRate: '0.0003',
      });
      expect(keys).toHaveLength(2);
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });

  it('skips lookup for an explicit version without configured defaults', async () => {
    const client = await createClient();
    const session = await client.openPerpsSession();
    try {
      signTypedData.mockClear();
      await session.approveBuilderFee({
        builder,
        maxFeeRate: '0.0005',
        approvalVersion: 4,
      });
      expect(reads).toBe(0);
      expect(signTypedData).toHaveBeenCalledTimes(1);
    } finally {
      await session.close();
    }
  });

  it('does not sign approval after a failed lookup', async () => {
    readStatus = 401;
    const client = await createClient();
    const session = await client.openPerpsSession({
      builderAttribution: { address: builder, feeRate: '0.0005' },
    });
    try {
      signTypedData.mockClear();
      await expect(session.approveBuilderFee()).rejects.toThrow();
      expect(submissions).toHaveLength(0);
      expect(signTypedData).not.toHaveBeenCalled();
      expect(session.closed).toBe(false);
    } finally {
      await session.close();
    }
  });

  it('does not sign or submit again after a version conflict', async () => {
    submitStatus = 409;
    const client = await createClient();
    const session = await client.openPerpsSession({
      builderAttribution: { address: builder, feeRate: '0.0005' },
    });
    try {
      signTypedData.mockClear();
      await expect(session.approveBuilderFee()).rejects.toThrow();
      expect(reads).toBe(1);
      expect(submissions).toHaveLength(1);
      expect(signTypedData).toHaveBeenCalledTimes(1);
    } finally {
      await session.close();
    }
  });

  it('rejects approval after the session closes without signing or fetching', async () => {
    const client = await createClient();
    const session = await client.openPerpsSession({
      builderAttribution: { address: builder, feeRate: '0.0005' },
    });
    await session.close();
    signTypedData.mockClear();
    await expect(session.approveBuilderFee()).rejects.toThrow(
      'Perps session is closed',
    );
    expect(reads).toBe(0);
    expect(signTypedData).not.toHaveBeenCalled();
  });
});
