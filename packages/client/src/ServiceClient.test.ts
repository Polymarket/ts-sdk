import { unwrap } from '@polymarket/types';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ServiceClient } from './ServiceClient';

const root = 'http://localhost:4011';
const server = setupServer();

describe('ServiceClient', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('uses JSON error fields as rejected request messages', async () => {
    server.use(
      http.get(`${root}/json-error`, () =>
        HttpResponse.json({ error: 'structured failure' }, { status: 400 }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(unwrap(client.get('/json-error'))).rejects.toMatchObject({
      message: `structured failure (${root}/json-error)`,
      name: 'RequestRejectedError',
      status: 400,
    });
  });

  it('prefers JSON error fields over Cloudflare response detection', async () => {
    server.use(
      http.get(`${root}/cloudflare-json-error`, () =>
        HttpResponse.json(
          { error: 'structured cloudflare failure' },
          { headers: { server: 'cloudflare' }, status: 400 },
        ),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(
      unwrap(client.get('/cloudflare-json-error')),
    ).rejects.toMatchObject({
      message: `structured cloudflare failure (${root}/cloudflare-json-error)`,
      name: 'RequestRejectedError',
      status: 400,
    });
  });

  it('uses plain text response bodies as rejected request messages', async () => {
    server.use(
      http.get(
        `${root}/text-error`,
        () =>
          new HttpResponse('plain failure', {
            headers: { 'content-type': 'text/plain' },
            status: 400,
          }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(unwrap(client.get('/text-error'))).rejects.toMatchObject({
      message: `plain failure (${root}/text-error)`,
      name: 'RequestRejectedError',
      status: 400,
    });
  });

  it('prefers plain text response bodies over Cloudflare response detection', async () => {
    server.use(
      http.get(
        `${root}/cloudflare-text-error`,
        () =>
          new HttpResponse('plain cloudflare failure', {
            headers: { 'content-type': 'text/plain', server: 'cloudflare' },
            status: 400,
          }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(
      unwrap(client.get('/cloudflare-text-error')),
    ).rejects.toMatchObject({
      message: `plain cloudflare failure (${root}/cloudflare-text-error)`,
      name: 'RequestRejectedError',
      status: 400,
    });
  });

  it('identifies Cloudflare-blocked responses without reading the body', async () => {
    server.use(
      http.get(
        `${root}/html-error`,
        () =>
          new HttpResponse('<!doctype html><html>Cloudflare error</html>', {
            headers: {
              'content-type': 'text/html; charset=utf-8',
              server: 'cloudflare',
            },
            status: 502,
          }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(unwrap(client.get('/html-error'))).rejects.toMatchObject({
      message: `Request to ${root}/html-error was blocked by Cloudflare with status 502`,
      name: 'RequestRejectedError',
      status: 502,
    });
  });

  it('identifies unreadable HTML errors when the server is unknown', async () => {
    server.use(
      http.get(
        `${root}/generic-html-error`,
        () =>
          new HttpResponse('<!doctype html><html>Gateway error</html>', {
            headers: { 'content-type': 'text/html; charset=utf-8' },
            status: 502,
          }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(
      unwrap(client.get('/generic-html-error')),
    ).rejects.toMatchObject({
      message: `Request to ${root}/generic-html-error failed with status 502 and an unexpected HTML response body`,
      name: 'RequestRejectedError',
      status: 502,
    });
  });

  it('falls back to an unreadable-body message for unknown content types', async () => {
    server.use(
      http.get(
        `${root}/binary-error`,
        () =>
          new HttpResponse(new Uint8Array([0, 1, 2, 3]), {
            headers: { 'content-type': 'application/octet-stream' },
            status: 500,
          }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(unwrap(client.get('/binary-error'))).rejects.toMatchObject({
      message: `Request to ${root}/binary-error failed with status 500 and unreadable response body`,
      name: 'RequestRejectedError',
      status: 500,
    });
  });
});
