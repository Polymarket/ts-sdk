import type {
  AuthenticationWorkflowRequest,
  BasePublicClient,
  Signer,
} from '@polymarket/client';
import { CancelledSigningError, WalletType } from '@polymarket/client';
import { fetchDepositWallet } from '@polymarket/client/actions';
import { expectEvmAddress, invariant } from '@polymarket/types';
import { useCallback, useMemo, useRef } from 'react';
import { usePolymarketContext } from './context';
import { UnsupportedAccountError } from './errors';
import type { Session } from './session';
import { sessionSignerViolation } from './session';
import type { WorkflowHandler } from './workflow';
import { driveWorkflow, WorkflowCancelled } from './workflow';

export type AuthenticateOptions = {
  /**
   * Explicit account wallet address to authenticate as, such as a UUPS
   * Deposit Wallet, Poly Safe, or Poly Proxy wallet.
   *
   * @defaultValue The signer's Deposit Wallet.
   */
  wallet?: string;

  /**
   * Nonce used when creating or deriving credentials.
   *
   * @defaultValue 0
   */
  nonce?: number;
};

export type AuthenticationStatus =
  | 'unauthenticated'
  | 'authenticating'
  | 'authenticated';

export type UseAuthenticationResult = {
  /** Current authentication status. */
  status: AuthenticationStatus;
  /** Active session, or `undefined` while unauthenticated. */
  session: Session | undefined;
  /** Why the last session ended or the last authentication failed. */
  error: unknown;
  /** Revokes the session credentials and returns to unauthenticated. */
  logout: () => Promise<void>;
};

export type UseAuthenticationWithHandlerResult = UseAuthenticationResult & {
  /**
   * Establishes a fresh session through the workflow handler.
   *
   * @remarks
   * Resolves the account wallet — the signer's Deposit Wallet unless an
   * explicit wallet address (e.g. a UUPS Deposit Wallet, Poly Safe, or Poly
   * Proxy wallet) is provided — runs the wallet-interactive authentication
   * workflow, stores the resulting {@link Session}, and resolves with it.
   * Failures also surface on the hook's `error` state.
   *
   * Errors thrown by the workflow handler itself are rethrown, such as
   * `WalletClientUnavailableError` from `@polymarket/react/viem` while no
   * wallet client is connected yet.
   *
   * @throws {@link UnsupportedAccountError}
   * Thrown when authentication resolves to an EOA account configuration.
   *
   * @throws {@link CancelledSigningError}
   * Thrown when the handler cancels a workflow step or the wallet rejects a
   * signature.
   */
  authenticate: (options?: AuthenticateOptions) => Promise<Session>;
};

/**
 * Exposes the provider's authentication state, status-only.
 *
 * @remarks
 * Use this overload in components that display or persist session state but
 * never establish one; `authenticate` is excluded from the result. Session
 * persistence stays app-owned: persist `session` when it changes and pass it
 * back through `initialSession`.
 *
 * @example
 * ```tsx
 * const { session, status } = useAuthentication();
 *
 * useEffect(() => {
 *   session ? saveSession(session) : clearSession();
 * }, [session]);
 * ```
 */
export function useAuthentication(): UseAuthenticationResult;
/**
 * Exposes the provider's authentication state and session lifecycle,
 * including `authenticate()` driven by the provided workflow handler.
 *
 * @remarks
 * See {@link UseAuthenticationWithHandlerResult} for the `authenticate()`
 * contract, including its rejection behavior.
 *
 * @example
 * ```tsx
 * const handler = useWorkflowHandler(walletClient);
 * const { authenticate, logout, status, session } = useAuthentication(handler);
 *
 * if (status === 'authenticated') {
 *   return <button onClick={logout}>Disconnect</button>;
 * }
 *
 * return <button onClick={() => authenticate()}>Connect</button>;
 * ```
 */
export function useAuthentication(
  handler: WorkflowHandler<AuthenticationWorkflowRequest>,
): UseAuthenticationWithHandlerResult;
export function useAuthentication(
  handler?: WorkflowHandler<AuthenticationWorkflowRequest>,
): UseAuthenticationResult | UseAuthenticationWithHandlerResult {
  const { publicClient, secureClient, auth, setAuth } = usePolymarketContext();

  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const authenticate = useCallback(
    async (options?: AuthenticateOptions): Promise<Session> => {
      const currentHandler = handlerRef.current;

      invariant(
        currentHandler !== undefined,
        '`authenticate()` requires the workflow handler passed to `useAuthentication`.',
      );

      setAuth({
        status: 'authenticating',
        session: undefined,
        error: undefined,
      });

      try {
        const session = await establishSession(
          publicClient,
          currentHandler,
          options,
        );

        setAuth({ status: 'authenticated', session, error: undefined });
        return session;
      } catch (error) {
        setAuth({ status: 'unauthenticated', session: undefined, error });
        throw error;
      }
    },
    [publicClient, setAuth],
  );

  const logout = useCallback(async () => {
    const client = secureClient;

    setAuth({
      status: 'unauthenticated',
      session: undefined,
      error: undefined,
    });

    if (client !== undefined) {
      await client.endAuthentication();
    }
  }, [secureClient, setAuth]);

  return useMemo(() => {
    const base: UseAuthenticationResult = {
      status: auth.status,
      session: auth.session,
      error: auth.status === 'unauthenticated' ? auth.error : undefined,
      logout,
    };

    return handler === undefined ? base : { ...base, authenticate };
  }, [auth, logout, authenticate, handler]);
}

async function establishSession(
  client: BasePublicClient,
  handler: WorkflowHandler<AuthenticationWorkflowRequest>,
  options: AuthenticateOptions | undefined,
): Promise<Session> {
  const address = await resolveHandlerAddress(handler);
  const wallet =
    options?.wallet ?? (await fetchDepositWallet(client, { address }));

  if (wallet.toLowerCase() === address.toLowerCase()) {
    throw new UnsupportedAccountError(
      'EOA accounts are not supported. Authenticate with a Deposit Wallet or a legacy Safe/Proxy wallet instead.',
    );
  }

  const workflow = await client.beginAuthentication(
    { wallet, nonce: options?.nonce },
    createDiscardedClientSigner(address),
  );

  const authenticated = await driveWorkflow(workflow, handler);

  if (authenticated.account.walletType === WalletType.EOA) {
    throw new UnsupportedAccountError(
      'EOA accounts are not supported. Authenticate with a Deposit Wallet or a legacy Safe/Proxy wallet instead.',
    );
  }

  return {
    address: authenticated.account.signer,
    wallet: authenticated.account.wallet,
    credentials: authenticated.credentials,
  };
}

async function resolveHandlerAddress(
  handler: WorkflowHandler<AuthenticationWorkflowRequest>,
): Promise<string> {
  const response = await handler(
    { kind: 'requestAddress' },
    { cancel: (reason?: string) => new WorkflowCancelled(reason) },
  );

  if (response instanceof WorkflowCancelled) {
    throw new CancelledSigningError(
      response.reason ?? 'The workflow was cancelled.',
    );
  }

  return expectEvmAddress(response);
}

/**
 * Signer parked on the workflow-produced client, which is discarded once the
 * session is extracted; the session-derived client owns the live signer.
 */
function createDiscardedClientSigner(address: string): Signer {
  return {
    getAddress() {
      return Promise.resolve(expectEvmAddress(address));
    },
    signMessage() {
      return Promise.reject(sessionSignerViolation('signMessage'));
    },
    signTypedData() {
      return Promise.reject(sessionSignerViolation('signTypedData'));
    },
    sendTransaction() {
      return Promise.reject(sessionSignerViolation('sendTransaction'));
    },
  };
}
