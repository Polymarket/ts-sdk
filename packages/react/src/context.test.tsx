import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createConfig } from './config';
import { PolymarketProvider, usePolymarketClient } from './context';
import { MissingProviderError } from './errors';

describe('PolymarketProvider', () => {
  it('provides a stable client across renders', () => {
    const config = createConfig();

    function wrapper({ children }: { children: ReactNode }) {
      return (
        <PolymarketProvider config={config}>{children}</PolymarketProvider>
      );
    }

    const { result, rerender } = renderHook(() => usePolymarketClient(), {
      wrapper,
    });
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
    expect(first.isPublicClient()).toBe(true);
  });

  it('throws MissingProviderError outside of a provider', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    expect(() => renderHook(() => usePolymarketClient())).toThrow(
      MissingProviderError,
    );

    consoleError.mockRestore();
  });
});
