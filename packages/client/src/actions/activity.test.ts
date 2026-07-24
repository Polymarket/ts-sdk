import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPublicClient } from '../clients';
import { forkEnvironmentConfig } from '../environments';
import { UserInputError } from '../errors';
import { listActivity } from './activity';

const dataRoot = 'http://localhost:4017';
const server = setupServer();
const environment = forkEnvironmentConfig({
  name: 'test',
  data: { rest: dataRoot },
});
const client = createPublicClient({ environment });
const user = '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b';

// The Data API clamps /activity limits at 500.
const ACTIVITY_LIMIT_CLAMP = 500;

function mockClampedActivityEndpoint(totalRows: number) {
  const rows = Array.from({ length: totalRows }, (_, index) => ({
    proxyWallet: user,
    timestamp: 1_700_000_000 + index,
    type: 'REWARD',
    usdcSize: 1,
    transactionHash: `0x${index.toString(16).padStart(64, '0')}`,
  }));
  const state = { requests: 0 };

  server.use(
    http.get(`${dataRoot}/activity`, ({ request }) => {
      state.requests += 1;
      const url = new URL(request.url);
      const limit = Math.min(
        Number(url.searchParams.get('limit')),
        ACTIVITY_LIMIT_CLAMP,
      );
      const offset = Number(url.searchParams.get('offset'));

      return HttpResponse.json(rows.slice(offset, offset + limit));
    }),
  );

  return state;
}

describe('listActivity offset pagination against a clamping endpoint', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('yields every row when pageSize equals the endpoint maximum', async () => {
    mockClampedActivityEndpoint(501);
    const items = [];

    for await (const page of listActivity(client, { user, pageSize: 500 })) {
      items.push(...page.items);
    }

    expect(items).toHaveLength(501);
  });

  it('rejects a pageSize above the endpoint maximum', () => {
    expect(() => listActivity(client, { user, pageSize: 501 })).toThrow(
      UserInputError,
    );
  });

  it('terminates on a short page without an extra request', async () => {
    const endpoint = mockClampedActivityEndpoint(5);
    const pages = [];

    for await (const page of listActivity(client, { user, pageSize: 10 })) {
      pages.push(page);
    }

    expect(pages).toHaveLength(1);
    expect(pages[0]?.items).toHaveLength(5);
    expect(endpoint.requests).toBe(1);
  });
});
