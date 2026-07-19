import type { TypedDataPayload } from '@polymarket/client';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createWalletClient, http, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { describe, expect, it } from 'vitest';
import { useAuthentication } from './authentication';
import { createConfig } from './config';
import { PolymarketProvider } from './context';
import { useWorkflowHandler, WalletClientUnavailableError } from './viem';
import { WorkflowCancelled } from './workflow';

const account = privateKeyToAccount(`0x${'a1'.repeat(32)}`);

const walletClient: WalletClient = createWalletClient({
  account,
  chain: polygon,
  transport: http('http://localhost:9'),
});

const payload: TypedDataPayload = {
  domain: { name: 'Test', version: '1', chainId: 137 },
  types: { Message: [{ name: 'value', type: 'string' }] },
  primaryType: 'Message',
  message: { value: 'hello' },
};

const controls = {
  cancel: (reason?: string) => new WorkflowCancelled(reason),
};

const config = createConfig();

function wrapper({ children }: { children: ReactNode }) {
  return <PolymarketProvider config={config}>{children}</PolymarketProvider>;
}

describe('useWorkflowHandler', () => {
  it('returns a handler that fails clearly while the wallet client is unavailable', async () => {
    const { result } = renderHook(() => useWorkflowHandler(undefined));

    await expect(
      result.current({ kind: 'requestAddress' }, controls),
    ).rejects.toThrow(WalletClientUnavailableError);
  });

  it('answers address and signature requests from the wallet client', async () => {
    const { result } = renderHook(() => useWorkflowHandler(walletClient));

    const address = await result.current({ kind: 'requestAddress' }, controls);
    expect(address?.toString().toLowerCase()).toBe(
      account.address.toLowerCase(),
    );

    const signature = await result.current(
      { kind: 'signAuthMessage', payload },
      controls,
    );
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/);
  });

  it('keeps a stable handler identity across wallet client changes', async () => {
    const { result, rerender } = renderHook(
      ({ client }: { client: WalletClient | undefined }) =>
        useWorkflowHandler(client),
      { initialProps: { client: undefined as WalletClient | undefined } },
    );

    const first = result.current;

    rerender({ client: walletClient });
    expect(result.current).toBe(first);

    // The stable handler picks up the connected wallet client.
    const address = await result.current({ kind: 'requestAddress' }, controls);
    expect(address?.toString().toLowerCase()).toBe(
      account.address.toLowerCase(),
    );
  });

  it('surfaces the unavailable wallet through authenticate()', async () => {
    const { result } = renderHook(
      () => {
        const handler = useWorkflowHandler(undefined);
        return useAuthentication(handler);
      },
      { wrapper },
    );

    await act(async () => {
      await expect(result.current.authenticate()).rejects.toThrow(
        WalletClientUnavailableError,
      );
    });

    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.error).toBeInstanceOf(WalletClientUnavailableError);
  });
});
