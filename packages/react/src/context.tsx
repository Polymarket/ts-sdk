import type { BaseClient } from '@polymarket/client';
import { createBaseClient } from '@polymarket/client';
import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import type { PolymarketConfig } from './config';
import { MissingProviderError } from './errors';

const PolymarketContext = createContext<BaseClient | undefined>(undefined);

export type PolymarketProviderProps = {
  /**
   * App-level SDK configuration created with `createConfig`.
   */
  config: PolymarketConfig;
  children?: ReactNode;
};

/**
 * Provides the Polymarket client to all Polymarket hooks below it.
 *
 * @example
 * ```tsx
 * const config = createConfig();
 *
 * function Root() {
 *   return (
 *     <PolymarketProvider config={config}>
 *       <App />
 *     </PolymarketProvider>
 *   );
 * }
 * ```
 */
export function PolymarketProvider(props: PolymarketProviderProps) {
  const { config, children } = props;

  const client = useMemo(
    () =>
      createBaseClient({
        environment: config.environment,
        apiKey: config.apiKey,
      }),
    [config],
  );

  return (
    <PolymarketContext.Provider value={client}>
      {children}
    </PolymarketContext.Provider>
  );
}

/**
 * Returns the Polymarket client from the nearest `PolymarketProvider`.
 *
 * @remarks
 * This is a low-level hook for calling standalone client actions directly.
 * Most consumers should prefer the dedicated hooks or the
 * `useClientAction`/`usePaginatedAction` primitives.
 *
 * @throws {@link MissingProviderError}
 * Thrown when used outside of a `PolymarketProvider`.
 */
export function usePolymarketClient(): BaseClient {
  const client = useContext(PolymarketContext);

  if (client === undefined) {
    throw new MissingProviderError('usePolymarketClient');
  }

  return client;
}
