import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPublicClient } from '../clients';
import { production } from '../environments';

const gammaRoot = 'http://localhost:4024';
const server = setupServer();

const environment = {
  ...production,
  gamma: gammaRoot,
};

describe('listEvents', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('defaults to open events', async () => {
    const requestUrl = mockEventsResponse();
    const client = createPublicClient({ environment });

    await client.listEvents({ pageSize: 10 }).firstPage();

    expect(requestUrl.current?.searchParams.get('closed')).toBe('false');
  });

  it('allows settled events to be requested explicitly', async () => {
    const requestUrl = mockEventsResponse();
    const client = createPublicClient({ environment });

    await client.listEvents({ closed: true, pageSize: 10 }).firstPage();

    expect(requestUrl.current?.searchParams.get('closed')).toBe('true');
  });
});

function mockEventsResponse() {
  const requestUrl: { current: URL | undefined } = { current: undefined };

  server.use(
    http.get(`${gammaRoot}/events/keyset`, ({ request }) => {
      requestUrl.current = new URL(request.url);

      return HttpResponse.json({
        events: [{ id: '1' }],
      });
    }),
  );

  return requestUrl;
}
