import {
  type AccessTokenClaims,
  AccessTokenClaimsSchema,
  type AccessTokenResponse,
  type BearerCredentials,
  type TokenResponse,
} from '@polymarket/bindings';
import {
  type EvmAddress,
  isSameEvmAddress,
  setNonBlockingTimeout,
} from '@polymarket/types';
import {
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from './errors';
import { DEFAULT_REQUEST_TIMEOUT_MS, withAbort } from './request-options';

export type CredentialsChanged = (
  credentials: BearerCredentials,
) => void | Promise<void>;

type SessionOptions = {
  credentials: BearerCredentials;
  /** Access-token lifetime in seconds when the credentials were issued. Unknown for restored credentials. */
  expiresIn?: number;
  refresh: (
    credentials: BearerCredentials,
    signal: AbortSignal,
  ) => Promise<TokenResponse>;
  onCredentialsChanged?: CredentialsChanged;
};

/** Renewal starts this long before the access token expires. */
const RENEWAL_LEAD_MS = 30_000;
/** Upper bound for the backoff between renewals after transient failures. */
const MAX_RETRY_DELAY_MS = 30_000;

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

/**
 * One owner for token adoption, refresh, notification and deterministic shutdown.
 *
 * Transient renewal failures (transport errors, rate limits and server errors)
 * keep the session. The current access token stays in use while it is valid
 * and renewal is retried with backoff. Only a definite rejection or an invalid
 * renewal response ends the session.
 * @internal
 */
export class AuthSession {
  readonly #options: SessionOptions;
  readonly #abort = new AbortController();
  readonly #listeners = new Set<(credentials: BearerCredentials) => void>();
  readonly #failureListeners = new Set<(error: Error) => void>();
  #credentials: BearerCredentials;
  #claims: AccessTokenClaims;
  // Token `exp` minus the local expiry derived from `expiresIn`, in milliseconds.
  // It absorbs the difference between the local and server clocks.
  #clockOffset = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #refreshing: Promise<BearerCredentials> | undefined;
  #binding: Promise<void> | undefined;
  #retries = 0;
  #failure: Error | undefined;
  #closed = false;

  constructor(options: SessionOptions) {
    this.#options = options;
    this.#credentials = { ...options.credentials };
    this.#claims = accessTokenClaims(options.credentials.accessToken);
    if (options.expiresIn !== undefined)
      this.#clockOffset = clockOffset(this.#claims, options.expiresIn);
  }

  get credentials(): BearerCredentials {
    return { ...this.#credentials };
  }
  get claims(): AccessTokenClaims {
    return { ...this.#claims };
  }
  /** The failure that ended the session, if renewal failed for good. */
  get failure(): Error | undefined {
    return this.#failure;
  }
  /** Local time in milliseconds at which `accessToken` expires. */
  expiresAt(accessToken: string): number {
    const claims =
      accessToken === this.#credentials.accessToken
        ? this.#claims
        : accessTokenClaims(accessToken);
    return claims.exp * 1000 - this.#clockOffset;
  }
  assertActive(): void {
    if (this.#closed)
      throw new TransportError('The authenticated session is closed.');
    if (this.#failure !== undefined) throw this.#failure;
  }
  async ready(signal?: AbortSignal): Promise<BearerCredentials> {
    this.assertActive();
    const remaining =
      this.expiresAt(this.#credentials.accessToken) - Date.now();
    // A renewal in flight may be replacing a token the server already rejected.
    if (this.#refreshing === undefined && remaining > RENEWAL_LEAD_MS)
      return this.credentials;
    // A scheduled retry owns renewal while the current bearer is still valid.
    if (this.#retries > 0 && this.#refreshing === undefined && remaining > 0)
      return this.credentials;
    try {
      return await withAbort(this.refresh(), signal);
    } catch (error) {
      if (
        signal?.aborted ||
        this.#closed ||
        this.#failure !== undefined ||
        this.expiresAt(this.#credentials.accessToken) <= Date.now()
      )
        throw error;
      return this.credentials;
    }
  }
  start(): void {
    this.#schedule();
  }
  onChange(listener: (credentials: BearerCredentials) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  /** Listens for the failure that ends the session. Transient renewal failures are not reported. */
  onFailure(listener: (error: Error) => void): () => void {
    this.#failureListeners.add(listener);
    return () => this.#failureListeners.delete(listener);
  }
  async recover(
    previousAccessToken: string,
    signal?: AbortSignal,
  ): Promise<void> {
    this.assertActive();
    if (
      this.#refreshing !== undefined ||
      previousAccessToken === this.#credentials.accessToken
    )
      await withAbort(this.refresh(), signal);
  }
  refresh(): Promise<BearerCredentials> {
    this.assertActive();
    if (this.#refreshing !== undefined) return this.#refreshing;
    clearTimeout(this.#timer);
    const binding = this.#binding;
    // Install the shared promise before invoking any consumer refresh callback.
    const refreshing = Promise.resolve()
      .then(async () => {
        // A renewal that the server answers before a bind still names the
        // previous wallet, so a renewal requested during a bind starts after it.
        if (binding !== undefined)
          await withAbort(binding, this.#abort.signal).catch(() => undefined);
        return this.#renew();
      })
      .catch((cause: unknown) => {
        const error =
          cause instanceof Error
            ? cause
            : new TransportError('Session renewal failed.');
        if (!this.#closed) {
          if (isTransient(error)) this.#retryLater(error);
          else this.#end(error);
        }
        throw error;
      })
      .finally(() => {
        if (this.#refreshing === refreshing) this.#refreshing = undefined;
      });
    this.#refreshing = refreshing;
    return refreshing;
  }
  /**
   * Binds `wallet` to this session and adopts the wallet-bound access token.
   * The session can already name another wallet. The refresh token does not
   * change. The bound token keeps the expiry of the token that the bind
   * presents, so the session refreshes a token that expires within the
   * renewal lead before the bind, and renews a short-lived bound token at once.
   * The bind waits for a renewal in flight, and a renewal requested during the
   * bind starts after it. The bind fails with `TransportError` when it does not
   * finish within the request timeout. The session then ignores its answer and
   * renews at once, because the server may have applied the bind.
   */
  async bindWallet(
    wallet: EvmAddress,
    upgrade: (
      accessToken: string,
      signal: AbortSignal,
    ) => Promise<AccessTokenResponse>,
  ): Promise<void> {
    do {
      await this.ready();
    } while (this.#refreshing !== undefined);
    // Publish the bind before its request, so that a renewal requested from
    // now on waits for it.
    const binding = Promise.resolve().then(() => this.#bind(wallet, upgrade));
    this.#binding = binding;
    try {
      await binding;
    } finally {
      if (this.#binding === binding) this.#binding = undefined;
    }
  }
  async #bind(
    wallet: EvmAddress,
    upgrade: (
      accessToken: string,
      signal: AbortSignal,
    ) => Promise<AccessTokenResponse>,
  ): Promise<void> {
    this.assertActive();
    // A renewal waits for the bind, so the bind must end even when its
    // response stalls. A late answer must not replace newer credentials.
    const deadline = new AbortController();
    const timer = setNonBlockingTimeout(
      () => deadline.abort(),
      DEFAULT_REQUEST_TIMEOUT_MS,
    );
    const signal = AbortSignal.any([this.#abort.signal, deadline.signal]);
    let next: AccessTokenResponse;
    try {
      next = await withAbort(
        upgrade(this.#credentials.accessToken, signal),
        signal,
      );
    } catch (error) {
      this.assertActive();
      if (!deadline.signal.aborted) throw error;
      // The server may have applied the bind before its answer stalled. Renew
      // at once, so that requests use the wallet that the server reports.
      void this.refresh().catch(() => undefined);
      throw new TransportError('The wallet binding timed out.');
    } finally {
      clearTimeout(timer);
    }
    this.assertActive();
    const claims = issuedClaims(next.accessToken);
    if (
      !isSameEvmAddress(claims.sub, this.#claims.sub) ||
      claims.client_id !== this.#claims.client_id ||
      claims.wallet === undefined ||
      !isSameEvmAddress(claims.wallet, wallet)
    )
      throw new UnexpectedResponseError(
        'The wallet binding returned a different session identity.',
      );
    this.#adopt(
      {
        accessToken: next.accessToken,
        refreshToken: this.#credentials.refreshToken,
      },
      claims,
      next.expiresIn,
    );
  }
  async #renew(): Promise<BearerCredentials> {
    let next: TokenResponse | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      this.assertActive();
      try {
        next = await this.#options.refresh(
          this.credentials,
          this.#abort.signal,
        );
        break;
      } catch (error) {
        this.assertActive();
        if (!isTransient(error) || attempt === 2) throw error;
        // A long server-requested delay is left to the session retry timer.
        const retryAfter = retryAfterSeconds(error);
        if (retryAfter !== undefined && retryAfter > 5) throw error;
        await wait(
          Math.max(250 * 2 ** attempt, (retryAfter ?? 0) * 1000),
          this.#abort.signal,
        );
      }
    }
    this.assertActive();
    if (next === undefined) throw new TransportError('Session renewal failed.');
    const claims = issuedClaims(next.accessToken);
    if (
      next.expiresIn * 1000 <= RENEWAL_LEAD_MS ||
      !sameSessionOwner(this.#claims, claims)
    )
      throw new UnexpectedResponseError(
        'Session renewal returned a different identity or an unusable expiry.',
      );
    this.#adopt(
      { accessToken: next.accessToken, refreshToken: next.refreshToken },
      claims,
      next.expiresIn,
    );
    this.assertActive();
    return this.credentials;
  }
  #adopt(
    credentials: BearerCredentials,
    claims: AccessTokenClaims,
    expiresIn: number,
  ): void {
    this.#credentials = { ...credentials };
    this.#claims = claims;
    this.#clockOffset = clockOffset(claims, expiresIn);
    this.#retries = 0;
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
  }
  #retryLater(error: Error): void {
    this.#retries++;
    const backoff = Math.min(
      MAX_RETRY_DELAY_MS,
      1_000 * 2 ** (this.#retries - 1),
    );
    const delay = Math.max(backoff, (retryAfterSeconds(error) ?? 0) * 1000);
    clearTimeout(this.#timer);
    this.#timer = setNonBlockingTimeout(
      () => {
        void this.refresh().catch(() => undefined);
      },
      Math.min(2_147_483_647, delay),
    );
  }
  #end(error: Error): void {
    this.#failure = error;
    clearTimeout(this.#timer);
    for (const listener of this.#failureListeners) listener(error);
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
        Math.max(
          0,
          this.expiresAt(this.#credentials.accessToken) -
            Date.now() -
            RENEWAL_LEAD_MS,
        ),
      ),
    );
  }
  /** Revokes the refresh session without reopening or persisting a closing client. */
  async logout(revoke: (accessToken: string) => Promise<void>): Promise<void> {
    let credentials = this.credentials;
    const identity = this.claims;
    const expired = this.expiresAt(this.#credentials.accessToken) <= Date.now();
    // Stop ordinary renewal and abort its in-flight work before acquiring any
    // bearer needed solely for revocation. Cached renewal failures do not
    // prevent revocation with a still-valid access token.
    this.close();
    const refresh = async () => {
      const next = await this.#options.refresh(
        credentials,
        new AbortController().signal,
      );
      if (!sameSessionOwner(identity, issuedClaims(next.accessToken)))
        throw new UnexpectedResponseError(
          'Logout renewal returned a different session identity.',
        );
      credentials = {
        accessToken: next.accessToken,
        refreshToken: next.refreshToken,
      };
    };
    if (expired) await refresh();
    try {
      await revoke(credentials.accessToken);
    } catch (error) {
      if (
        !(error instanceof RequestRejectedError) ||
        error.status !== 401 ||
        error.code !== 'expired_access_token'
      )
        throw error;
      // The token can expire in flight (or the server clock can be ahead).
      // Replay only this explicit rejection, once, with a fresh bearer.
      await refresh();
      await revoke(credentials.accessToken);
    }
  }

  close(): void {
    this.#closed = true;
    this.#retries = 0;
    clearTimeout(this.#timer);
    this.#abort.abort();
    this.#listeners.clear();
    this.#failureListeners.clear();
  }
}

/** Server responses with unreadable tokens violate the identity contract. */
function issuedClaims(accessToken: string): AccessTokenClaims {
  try {
    return accessTokenClaims(accessToken);
  } catch {
    throw new UnexpectedResponseError(
      'The server issued an access token with invalid session metadata.',
    );
  }
}

function clockOffset(claims: AccessTokenClaims, expiresIn: number): number {
  return claims.exp * 1000 - (Date.now() + expiresIn * 1000);
}

/** Failures that leave the refresh session usable once the cause clears. */
function isTransient(error: unknown): boolean {
  return (
    error instanceof TransportError ||
    error instanceof RateLimitError ||
    (error instanceof RequestRejectedError && error.status >= 500)
  );
}

function retryAfterSeconds(error: unknown): number | undefined {
  return error instanceof RateLimitError ||
    error instanceof RequestRejectedError
    ? error.retryAfter
    : undefined;
}

/**
 * Checks that a renewed token belongs to the same signer and application.
 * Wallet claims are not compared: another client sharing this refresh session
 * can bind a wallet, and the server owns which wallet a session may use.
 */
function sameSessionOwner(a: AccessTokenClaims, b: AccessTokenClaims): boolean {
  return isSameEvmAddress(a.sub, b.sub) && a.client_id === b.client_id;
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
