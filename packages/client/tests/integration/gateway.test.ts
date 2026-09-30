import { createPublicClient, forkEnvironmentConfig } from '@polymarket/client';
import { afterEach, vi } from 'vitest';
import { describe, environment, expect, it } from './fixtures';

describe('gateway discovery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads through the gateway without calling the direct service', async () => {
    const observed = vi.spyOn(globalThis, 'fetch');
    const client = createPublicClient({ environment });

    const page = await client.listEvents({ pageSize: 2 }).firstPage();

    expect(page.items.length).toBeGreaterThan(0);
    const requests = observed.mock.calls.map(
      ([request]) => new Request(request),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain(
      `${environment.gateway.rest}/events/keyset`,
    );
  });

  it('continues real discovery pagination after a gateway connection failure', async () => {
    const observed = vi.spyOn(globalThis, 'fetch');
    const client = createPublicClient({
      environment: forkEnvironmentConfig(
        {
          name: 'gateway-unreachable',
          gateway: { rest: 'http://127.0.0.1:49199' },
        },
        environment,
      ),
    });

    const events = client.listEvents({ pageSize: 2 });
    const first = await events.firstPage();
    expect(first.items.length).toBeGreaterThan(0);
    expect(first.nextCursor).toBeDefined();
    for await (const page of events.from(first.nextCursor)) {
      expect(page.items.length).toBeGreaterThan(0);
      expect(page.items[0]?.id).not.toBe(first.items[0]?.id);
      break;
    }

    const requests = observed.mock.calls.map(
      ([request]) => new Request(request),
    );
    expect(
      requests.filter((request) =>
        request.url.startsWith('http://127.0.0.1:49199/'),
      ),
    ).toHaveLength(2);
    const direct = requests.filter((request) =>
      request.url.startsWith(environment.gamma.rest),
    );
    expect(direct).toHaveLength(2);
    for (const request of direct) {
      expect(request.headers.has('x-api-key')).toBe(false);
      expect(request.headers.has('authorization')).toBe(false);
    }
  });
});
