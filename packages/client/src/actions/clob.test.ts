import { BuilderCodeSchema } from '@polymarket/bindings';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPublicClient } from '../clients';
import { production } from '../environments';
import { RequestRejectedError } from '../errors';
import { fetchBuilderFeeRates } from './clob';

const clobRoot = 'http://localhost:4020';
const builderCode = BuilderCodeSchema.parse(
  '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
);
const server = setupServer();

const client = createPublicClient({
  environment: {
    ...production,
    clob: clobRoot,
  },
});

describe('fetchBuilderFeeRates', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('maps unknown builder code responses to a typed error', async () => {
    server.use(
      http.get(`${clobRoot}/fees/builder-fees/${builderCode}`, () =>
        HttpResponse.json({ error: 'builder code not found' }, { status: 404 }),
      ),
    );

    await expect(
      fetchBuilderFeeRates(client, { builderCode }),
    ).rejects.toMatchObject({
      builderCode,
      cause: expect.any(RequestRejectedError),
      name: 'UnknownBuilderCodeError',
      status: 404,
    });
  });

  it('preserves non-404 request rejections', async () => {
    server.use(
      http.get(`${clobRoot}/fees/builder-fees/${builderCode}`, () =>
        HttpResponse.json(
          { error: 'temporarily unavailable' },
          { status: 503 },
        ),
      ),
    );

    await expect(fetchBuilderFeeRates(client, { builderCode })).rejects.toEqual(
      expect.objectContaining({
        name: 'RequestRejectedError',
        status: 503,
      }),
    );
  });
});
