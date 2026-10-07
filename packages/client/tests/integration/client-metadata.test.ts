import { createPublicClient, forkEnvironmentConfig } from '@polymarket/client';
import { afterEach, vi } from 'vitest';
import { version } from '../../package.json';
import { describe, environment, expect, it } from './fixtures';

describe('gateway client metadata', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends generated metadata instead of configured and request overrides', async () => {
    const observed = vi.spyOn(globalThis, 'fetch');
    const client = createPublicClient({
      environment: forkEnvironmentConfig(
        {
          name: 'gateway-metadata',
          gateway: { headers: { polymarket_client: 'configured-override' } },
        },
        environment,
      ),
    });

    const response = await client.gateway.get('/events/keyset', {
      params: new URLSearchParams({ limit: '2' }),
      headers: { Polymarket_Client: 'request-override' },
    });
    if (response.isErr()) throw response.error;
    expect(response.value.status).toBe(200);
    await response.value.arrayBuffer();

    const requests = observed.mock.calls.map(
      ([request]) => new Request(request),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain('/events/keyset');
    expect(requests[0]?.headers.get('POLYMARKET_CLIENT')).toBe(
      `@polymarket/client@${version}:nodejs@${process.versions.node}`,
    );
  });

  it('keeps direct discovery unchanged for an environment without gateway settings', async () => {
    const { gateway: _gateway, ...legacyEnvironment } = environment;
    const observed = vi.spyOn(globalThis, 'fetch');
    const client = createPublicClient({ environment: legacyEnvironment });

    const response = await client.gateway.get('/events/keyset', {
      params: new URLSearchParams({ limit: '2' }),
    });
    if (response.isErr()) throw response.error;
    await response.value.arrayBuffer();
    expect(response.value.status).toBe(200);
    expect(observed.mock.calls).toHaveLength(1);
    const [gatewayRequest] = observed.mock.calls.map(
      ([request]) => new Request(request),
    );
    expect(gatewayRequest?.headers.get('POLYMARKET_CLIENT')).toBe(
      `@polymarket/client@${version}:nodejs@${process.versions.node}`,
    );
    observed.mockClear();

    const page = await client.listEvents({ pageSize: 2 }).firstPage();
    expect(page.items.length).toBeGreaterThan(0);
    const requests = observed.mock.calls.map(
      ([request]) => new Request(request),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain(
      `${environment.gamma.rest}/events/keyset`,
    );
    expect(requests[0]?.headers.has('POLYMARKET_CLIENT')).toBe(false);
  });
});
