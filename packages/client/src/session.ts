import {
  type AccessTokenClaims,
  AccessTokenClaimsSchema,
  type BearerCredentials,
} from '@polymarket/bindings';
import { isSameEvmAddress, setNonBlockingTimeout } from '@polymarket/types';
import {
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UserInputError,
} from './errors';
import { withAbort } from './request-options';

export type CredentialsChanged = (
  credentials: BearerCredentials,
) => void | Promise<void>;

type SessionOptions = {
  credentials: BearerCredentials;
  refresh: (
    credentials: BearerCredentials,
    signal: AbortSignal,
  ) => Promise<BearerCredentials>;
  onCredentialsChanged?: CredentialsChanged;
};

/** Decode unverified scheduling metadata; never use this as server authorization. @internal */
export function accessTokenClaims(token: string): AccessTokenClaims {
  try {
    const payload = token.split('.')[1];
    if (payload === undefined) throw new Error();
    return AccessTokenClaimsSchema.parse(
      JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))),
    );
  } catch {
    throw new UserInputError('The access token has invalid session metadata.');
  }
}

/** One owner for token adoption, refresh, notification and deterministic shutdown. @internal */
export class AuthSession {
  readonly #options: SessionOptions;
  readonly #abort = new AbortController();
  readonly #listeners = new Set<(credentials: BearerCredentials) => void>();
  readonly #failureListeners = new Set<(error: Error) => void>();
  #credentials: BearerCredentials;
  #claims: AccessTokenClaims;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #refreshing: Promise<BearerCredentials> | undefined;
  #refreshRequest: Promise<BearerCredentials> | undefined;
  #failure: Error | undefined;
  #closed = false;

  constructor(options: SessionOptions) {
    this.#options = options;
    this.#credentials = { ...options.credentials };
    this.#claims = accessTokenClaims(options.credentials.accessToken);
  }

  get credentials(): BearerCredentials {
    return { ...this.#credentials };
  }
  get claims(): AccessTokenClaims {
    return { ...this.#claims };
  }
  assertActive(): void {
    if (this.#closed)
      throw new TransportError('The authenticated session is closed.');
    if (this.#failure !== undefined) throw this.#failure;
  }
  async ready(signal?: AbortSignal): Promise<BearerCredentials> {
    this.assertActive();
    if (this.#refreshing !== undefined)
      return withAbort(this.#refreshing, signal);
    if (this.#claims.exp * 1000 - Date.now() <= 30_000)
      return withAbort(this.refresh(), signal);
    return this.credentials;
  }
  start(): void {
    this.#schedule();
  }
  onChange(listener: (credentials: BearerCredentials) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  onFailure(listener: (error: Error) => void): () => void {
    this.#failureListeners.add(listener);
    return () => this.#failureListeners.delete(listener);
  }
  async recover(
    previousAccessToken: string,
    signal?: AbortSignal,
  ): Promise<void> {
    this.assertActive();
    if (this.#refreshing !== undefined) {
      await withAbort(this.#refreshing, signal);
      return;
    }
    if (previousAccessToken !== this.#credentials.accessToken) return;
    await withAbort(this.refresh(), signal);
  }
  refresh(): Promise<BearerCredentials> {
    this.assertActive();
    if (this.#refreshing !== undefined) return this.#refreshing;
    clearTimeout(this.#timer);
    // Install the shared promise before invoking any consumer refresh callback.
    const refreshing = Promise.resolve()
      .then(() => this.#renew())
      .catch((cause: unknown) => {
        const error =
          cause instanceof Error
            ? cause
            : new TransportError('Session renewal failed.');
        if (!this.#closed) {
          this.#failure = error;
          for (const listener of this.#failureListeners) listener(error);
        }
        throw error;
      })
      .finally(() => {
        if (this.#refreshing === refreshing) this.#refreshing = undefined;
      });
    this.#refreshing = refreshing;
    return refreshing;
  }
  async #renew(): Promise<BearerCredentials> {
    let next: BearerCredentials | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      this.assertActive();
      try {
        const credentials = this.credentials;
        const request = Promise.resolve().then(() =>
          this.#options.refresh(credentials, this.#abort.signal),
        );
        this.#refreshRequest = request;
        try {
          next = await request;
        } finally {
          if (this.#refreshRequest === request)
            this.#refreshRequest = undefined;
        }
        break;
      } catch (error) {
        this.assertActive();
        const transient =
          error instanceof TransportError ||
          error instanceof RateLimitError ||
          (error instanceof RequestRejectedError && error.status >= 500);
        if (!transient || attempt === 2) throw error;
        const retryAfter =
          error instanceof RateLimitError ||
          error instanceof RequestRejectedError
            ? error.retryAfter
            : undefined;
        if (retryAfter !== undefined && retryAfter > 5) throw error;
        await wait(
          Math.max(250 * 2 ** attempt, (retryAfter ?? 0) * 1000),
          this.#abort.signal,
        );
      }
    }
    this.assertActive();
    if (next === undefined) throw new TransportError('Session renewal failed.');
    const claims = accessTokenClaims(next.accessToken);
    if (
      claims.exp * 1000 <= Date.now() + 30_000 ||
      !sameSessionIdentity(this.#claims, claims)
    )
      throw new RequestRejectedError(
        'Session renewal returned invalid identity or expiry.',
        { status: 401 },
      );
    this.#credentials = { ...next };
    this.#claims = claims;
    this.#schedule();
    for (const listener of this.#listeners) listener(this.credentials);
    // Persistence is advisory. Its failure must not discard adopted credentials,
    // stall sockets or retry a successful refresh. Applications handle storage errors.
    try {
      void Promise.resolve(
        this.#options.onCredentialsChanged?.(this.credentials),
      ).catch(() => undefined);
    } catch {
      /* documented policy */
    }
    this.assertActive();
    return this.credentials;
  }
  #schedule(): void {
    clearTimeout(this.#timer);
    if (this.#closed || this.#failure !== undefined) return;
    this.#timer = setNonBlockingTimeout(
      () => {
        void this.refresh().catch(() => undefined);
      },
      Math.min(
        2_147_483_647,
        Math.max(0, this.#claims.exp * 1000 - Date.now() - 30_000),
      ),
    );
  }
  /** Revokes the refresh session without reopening or persisting a closing client. */
  async logout(revoke: (accessToken: string) => Promise<void>): Promise<void> {
    let credentials = this.credentials;
    const identity = this.claims;
    // Close local consumers immediately, but let an already-started rotation
    // finish so revocation uses its result rather than reusing a consumed token.
    const pending = this.#refreshRequest;
    this.#stop(false);
    let canRefresh = true;
    const accept = (next: BearerCredentials) => {
      const claims = accessTokenClaims(next.accessToken);
      if (
        claims.exp * 1000 <= Date.now() ||
        !sameSessionIdentity(identity, claims)
      )
        throw new RequestRejectedError(
          'Logout renewal returned invalid identity or expiry.',
          { status: 401 },
        );
      credentials = { ...next };
    };
    const refresh = async () => {
      const next = await this.#options.refresh(
        credentials,
        new AbortController().signal,
      );
      accept(next);
    };
    try {
      if (pending !== undefined) {
        try {
          accept(await pending);
        } catch (error) {
          // A transport failure has an uncertain server outcome. Do not reuse
          // that refresh token; a still-valid bearer can still revoke safely.
          canRefresh = false;
          if (
            accessTokenClaims(credentials.accessToken).exp * 1000 <=
            Date.now()
          )
            throw error;
        }
      }
      if (
        canRefresh &&
        accessTokenClaims(credentials.accessToken).exp * 1000 <= Date.now()
      )
        await refresh();
      try {
        await revoke(credentials.accessToken);
      } catch (error) {
        if (
          !(error instanceof RequestRejectedError) ||
          error.status !== 401 ||
          error.code !== 'expired_access_token' ||
          !canRefresh
        )
          throw error;
        // The token can expire in flight (or the server clock can be ahead).
        // Replay only this explicit rejection, once, with a fresh bearer.
        await refresh();
        await revoke(credentials.accessToken);
      }
    } finally {
      this.#abort.abort();
    }
  }

  close(): void {
    this.#stop(true);
  }

  #stop(abortRefresh: boolean): void {
    this.#closed = true;
    clearTimeout(this.#timer);
    if (abortRefresh) this.#abort.abort();
    this.#listeners.clear();
    this.#failureListeners.clear();
  }
}

function sameSessionIdentity(
  a: AccessTokenClaims,
  b: AccessTokenClaims,
): boolean {
  return (
    isSameEvmAddress(a.sub, b.sub) &&
    a.client_id === b.client_id &&
    a.wallet?.toLowerCase() === b.wallet?.toLowerCase() &&
    a.signature_type === b.signature_type &&
    a.clob_api_key === b.clob_api_key
  );
}

function wait(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new TransportError('Session renewal stopped.'));
    };
    const timer = setNonBlockingTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, delay);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      signal.removeEventListener('abort', abort);
      abort();
    }
  });
}
