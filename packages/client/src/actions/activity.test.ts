import { ActivityType } from '@polymarket/bindings/data';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { BaseClient } from '../clients';
import { ServiceClient } from '../ServiceClient';
import { listActivity } from './activity';

const root = 'http://localhost:4018';
const server = setupServer();
const user = '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b';

describe('Activity actions', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('disables the deposit/withdrawal exclusion when those types are requested', async () => {
    const requests = interceptActivityRequests();

    await listActivity(createClient(), {
      user,
      type: [
        ActivityType.DEPOSIT,
        ActivityType.WITHDRAWAL,
        ActivityType.TAKER_REBATE,
      ],
    }).firstPage();

    expect(requests.map((params) => Object.fromEntries(params))).toEqual([
      {
        user,
        type: 'DEPOSIT,WITHDRAWAL,TAKER_REBATE',
        excludeDepositsWithdrawals: 'false',
        limit: '20',
        offset: '0',
      },
    ]);
  });

  it('disables the deposit/withdrawal exclusion for mixed type filters', async () => {
    const requests = interceptActivityRequests();

    await listActivity(createClient(), {
      user,
      type: [ActivityType.TRADE, ActivityType.DEPOSIT],
    }).firstPage();

    expect(requests.map((params) => Object.fromEntries(params))).toEqual([
      {
        user,
        type: 'TRADE,DEPOSIT',
        excludeDepositsWithdrawals: 'false',
        limit: '20',
        offset: '0',
      },
    ]);
  });

  it('keeps the default exclusion when deposits and withdrawals are not requested', async () => {
    const requests = interceptActivityRequests();

    await listActivity(createClient(), {
      user,
      type: [ActivityType.TRADE, ActivityType.TAKER_REBATE],
    }).firstPage();
    await listActivity(createClient(), { user }).firstPage();

    expect(requests.map((params) => Object.fromEntries(params))).toEqual([
      {
        user,
        type: 'TRADE,TAKER_REBATE',
        limit: '20',
        offset: '0',
      },
      {
        user,
        limit: '20',
        offset: '0',
      },
    ]);
  });
});

function interceptActivityRequests(): URLSearchParams[] {
  const requests: URLSearchParams[] = [];

  server.use(
    http.get(`${root}/activity`, ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return HttpResponse.json([]);
    }),
  );

  return requests;
}

function createClient(): BaseClient {
  return {
    data: new ServiceClient({ root }),
  } as unknown as BaseClient;
}
