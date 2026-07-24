import type {
  BaseClient,
  BasePublicClient,
  BaseSecureClient,
} from '@polymarket/client';
import {
  createBaseClient,
  createBaseSecureClient,
  WalletType,
} from '@polymarket/client';
import { invariant } from '@polymarket/types';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { PolymarketConfig } from './config';
import { UnsupportedAccountError } from './errors';
import type { Session } from './session';
import { createSessionSigner } from './session';

/** @internal */
export type AuthState =
  | { status: 'unauthenticated'; session: undefined; error: unknown }
  | { status: 'authenticating'; session: undefined; error: undefined }
  | { status: 'authenticated'; session: Session; error: undefined };

/** @internal */
export type PolymarketContextValue = {
  config: PolymarketConfig;
  publicClient: BasePublicClient;
  secureClient: BaseSecureClient | undefined;
  auth: AuthState;
  setAuth: Dispatch<SetStateAction<AuthState>>;
  /** Clears the session, optionally recording why it ended. */
  clearSession: (error?: unknown) => void;
};

const PolymarketContext = createContext<PolymarketContextValue | undefined>(
  undefined,
);

export type PolymarketProviderProps = {
  /**
   * App-level SDK configuration created with `createConfig`.
   */
  config: PolymarketConfig;

  /**
   * Existing session to restore synchronously at mount.
   *
   * @remarks
   * The session is trusted optimistically, like a web session cookie: no
   * validation round-trip runs, and a revoked session surfaces later as a 401
   * that transitions the provider back to `'unauthenticated'`. A malformed
   * session is dropped at mount and surfaces on `useAuthentication().error`.
   */
  initialSession?: Session;

  children?: ReactNode;
};

/**
 * Provides the Polymarket client and session state to all Polymarket hooks
 * below it.
 *
 * @example
 * ```tsx
 * const config = createConfig();
 *
 * function Root() {
 *   return (
 *     <PolymarketProvider config={config} initialSession={loadLastSession()}>
 *       <App />
 *     </PolymarketProvider>
 *   );
 * }
 * ```
 */
export function PolymarketProvider(props: PolymarketProviderProps) {
  const { config, initialSession, children } = props;

  const publicClient = useMemo(
    () =>
      createBaseClient({
        environment: config.environment,
        apiKey: config.apiKey,
      }),
    [config],
  );

  const [auth, setAuth] = useState<AuthState>(() =>
    createInitialAuthState(config, initialSession),
  );

  const secureClient = useMemo(
    () => deriveSecureClient(config, auth.session),
    [config, auth.session],
  );

  const clearSession = useCallback((error?: unknown) => {
    setAuth({ status: 'unauthenticated', session: undefined, error });
  }, []);

  const value = useMemo(
    () => ({ config, publicClient, secureClient, auth, setAuth, clearSession }),
    [config, publicClient, secureClient, auth, clearSession],
  );

  return (
    <PolymarketContext.Provider value={value}>
      {children}
    </PolymarketContext.Provider>
  );
}

function deriveSecureClient(
  config: PolymarketConfig,
  session: Session | undefined,
): BaseSecureClient | undefined {
  if (session === undefined) {
    return undefined;
  }

  const client = createBaseSecureClient({
    environment: config.environment,
    apiKey: config.apiKey,
    address: session.address,
    wallet: session.wallet,
    credentials: session.credentials,
    signer: createSessionSigner(session),
  });

  if (client.account.walletType === WalletType.EOA) {
    throw new UnsupportedAccountError(
      'EOA sessions are not supported. Sessions must be bound to a Deposit Wallet or a legacy Safe/Proxy wallet.',
    );
  }

  return client;
}

function createInitialAuthState(
  config: PolymarketConfig,
  initialSession: Session | undefined,
): AuthState {
  if (initialSession === undefined) {
    return { status: 'unauthenticated', session: undefined, error: undefined };
  }

  try {
    deriveSecureClient(config, initialSession);
    return {
      status: 'authenticated',
      session: initialSession,
      error: undefined,
    };
  } catch (error) {
    return { status: 'unauthenticated', session: undefined, error };
  }
}

/** @internal */
export function usePolymarketContext(): PolymarketContextValue {
  const context = useContext(PolymarketContext);

  invariant(
    context !== undefined,
    '`PolymarketProvider` is missing. Wrap your app in `<PolymarketProvider>`.',
  );

  return context;
}

/**
 * Returns the Polymarket client from the nearest `PolymarketProvider`.
 *
 * @remarks
 * This is the escape hatch for calling standalone client actions directly,
 * such as imperative fetches in event handlers. While a session is active it
 * returns the session-derived secure client, otherwise the public client.
 * Most consumers should prefer the dedicated hooks.
 */
export function usePolymarketClient(): BaseClient {
  const { publicClient, secureClient } = usePolymarketContext();

  return secureClient ?? publicClient;
}
