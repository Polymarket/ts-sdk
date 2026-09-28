import {
  type PredictionsIdentity,
  PredictionsIdentitySchema,
  type PredictionsTokens,
  PredictionsTokensSchema,
  SignerOwnershipChallengeSchema,
} from '@polymarket/bindings/gateway';
import {
  type EvmSignature,
  isSameEvmAddress,
  PolymarketError,
  unwrap,
} from '@polymarket/types';
import { Bytes, Hash } from 'ox';
import type { z } from 'zod';
import {
  CancelledSigningError,
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
} from './errors';
import type { ServiceClient } from './ServiceClient';
import type { Signer } from './types';
import { type AccountIdentity, toSignatureType } from './wallet';

/** The predictions session has ended locally or its refresh lifetime has expired. */
export class PredictionsSessionClosedError extends PolymarketError {
  override name = 'PredictionsSessionClosedError' as const;

  constructor() {
    super(
      'This predictions session has ended. Open a new predictions session to continue.',
    );
  }
}

export type OpenPredictionsSessionError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError;
export const OpenPredictionsSessionError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
);

export type FetchPredictionsIdentityError =
  | PredictionsSessionClosedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError;
export const FetchPredictionsIdentityError = makeErrorGuard(
  PredictionsSessionClosedError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
);

export type LogoutPredictionsSessionError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError;
export const LogoutPredictionsSessionError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
);

/**
 * A wallet-bound identity session with credentials held privately in memory.
 * Closing this session does not revoke trading credentials or close Perps sessions.
 * Ending the secure client's authentication does not close this handle; call
 * `logout()` explicitly as part of application sign-out.
 */
export type PredictionsSession = {
  /**
   * Fetches the signer and wallet authorized by this session.
   *
   * Refreshes on demand within 30 seconds of access-token expiry, or half the
   * token lifetime when shorter. Concurrent reads share one refresh. A failed
   * refresh blocks the read; a later call can try again without a signature prompt.
   *
   * @throws {@link FetchPredictionsIdentityError}
   * Thrown when the session has ended, refresh fails, or identity cannot be read.
   */
  fetchIdentity(): Promise<PredictionsIdentity>;
  /**
   * Ends local access immediately and requests server logout.
   *
   * If the request fails, this handle stays closed and another call to `logout`
   * retries server logout. Concurrent calls share one request. A confirmed logout
   * is idempotent. Previously issued access tokens keep their server expiry.
   *
   * @throws {@link LogoutPredictionsSessionError}
   * Thrown when server logout cannot be confirmed.
   */
  logout(): Promise<void>;
};

/** @internal Credentials with conservative absolute expiry times in milliseconds. */
export type PredictionsSessionCredentials = {
  accessToken: string;
  refreshToken: string;
  refreshAt: number;
  refreshExpiresAt: number;
};

/** @internal Operations required by the in-memory identity session lifecycle. */
export type PredictionsSessionDependencies = {
  open(): Promise<PredictionsSessionCredentials>;
  refresh(refreshToken: string): Promise<PredictionsSessionCredentials>;
  fetchIdentity(accessToken: string): Promise<PredictionsIdentity>;
  logout(refreshToken: string): Promise<void>;
  now(): number;
};

/** @internal Owns one reusable identity session and one pending opening. */
export class PredictionsSessionManager {
  readonly #dependencies: PredictionsSessionDependencies;
  #active: PredictionsSessionHandle | undefined;
  #opening: Promise<PredictionsSession> | undefined;

  constructor(dependencies: PredictionsSessionDependencies) {
    this.#dependencies = dependencies;
  }

  open(): Promise<PredictionsSession> {
    if (this.#active?.isActive()) return Promise.resolve(this.#active);
    if (this.#opening) return this.#opening;

    this.#opening = (async () => {
      const credentials = await this.#dependencies.open();
      const session = new PredictionsSessionHandle(
        credentials,
        this.#dependencies,
        () => {
          if (this.#active === session) this.#active = undefined;
        },
      );
      this.#active = session;
      return session;
    })().finally(() => {
      this.#opening = undefined;
    });
    return this.#opening;
  }
}

class PredictionsSessionHandle implements PredictionsSession {
  readonly #dependencies: PredictionsSessionDependencies;
  readonly #onClosed: () => void;
  #credentials: PredictionsSessionCredentials | undefined;
  #refreshing: Promise<void> | undefined;
  #loggingOut: Promise<void> | undefined;
  #ended = false;

  constructor(
    credentials: PredictionsSessionCredentials,
    dependencies: PredictionsSessionDependencies,
    onClosed: () => void,
  ) {
    this.#credentials = credentials;
    this.#dependencies = dependencies;
    this.#onClosed = onClosed;
  }

  isActive(): boolean {
    if (
      this.#credentials &&
      this.#dependencies.now() >= this.#credentials.refreshExpiresAt
    ) {
      this.#end();
    }
    return !this.#ended;
  }

  async fetchIdentity(): Promise<PredictionsIdentity> {
    await this.#ensureFresh();
    const credentials = this.#requireActive();
    const identity = await this.#dependencies.fetchIdentity(
      credentials.accessToken,
    );
    this.#requireActive();
    return identity;
  }

  logout(): Promise<void> {
    this.#end();
    if (this.#loggingOut) return this.#loggingOut;
    const credentials = this.#credentials;
    if (!credentials) return Promise.resolve();

    this.#loggingOut = (async () => {
      await this.#dependencies.logout(credentials.refreshToken);
      this.#credentials = undefined;
    })().finally(() => {
      this.#loggingOut = undefined;
    });
    return this.#loggingOut;
  }

  async #ensureFresh(): Promise<void> {
    const credentials = this.#requireActive();
    if (this.#dependencies.now() < credentials.refreshAt) return;
    if (this.#refreshing) return this.#refreshing;

    this.#refreshing = (async () => {
      const refreshed = await this.#dependencies.refresh(
        credentials.refreshToken,
      );
      this.#requireActive();
      this.#credentials = refreshed;
    })().finally(() => {
      this.#refreshing = undefined;
    });
    return this.#refreshing;
  }

  #requireActive(): PredictionsSessionCredentials {
    if (!this.isActive() || !this.#credentials)
      throw new PredictionsSessionClosedError();
    return this.#credentials;
  }

  #end(): void {
    if (this.#ended) return;
    this.#ended = true;
    this.#onClosed();
  }
}

/** @internal The fixed client identity used for session authentication. */
export type PredictionsSessionManagerOptions = {
  gateway: ServiceClient;
  signer: Signer;
  account: AccountIdentity;
  chainId: number;
  identityIssuer: string;
};

/** @internal Builds identity operations without exposing tokens to client actions. */
export function createPredictionsSessionManager({
  gateway,
  signer,
  account,
  chainId,
  identityIssuer,
}: PredictionsSessionManagerOptions): PredictionsSessionManager {
  const expectedSalt = Hash.keccak256(Bytes.fromString(identityIssuer), {
    as: 'Hex',
  });
  const signerAddress = account.signer;
  const wallet = account.wallet;
  const signatureType = toSignatureType(account.walletType);
  return new PredictionsSessionManager({
    now: Date.now,
    async open() {
      const response = await unwrap(
        gateway.post('/v1/auth/challenge', {
          json: { signer: signerAddress },
          timeout: 10_000,
        }),
      );
      const challenge = await readIdentityResponse(
        response,
        SignerOwnershipChallengeSchema,
      );
      const { domain, message } = challenge.typedData;
      if (
        domain.chainId !== chainId ||
        domain.salt.toLowerCase() !== expectedSalt ||
        !isSameEvmAddress(message.signer, signerAddress) ||
        Number(message.expiresAt) * 1000 <= Date.now()
      ) {
        throw new UnexpectedResponseError(
          'The signer ownership challenge does not match this client or has expired.',
        );
      }

      let signature: EvmSignature;
      try {
        signature = await signer.signTypedData(challenge.typedData);
      } catch (error) {
        if (
          error instanceof CancelledSigningError ||
          error instanceof SigningError
        ) {
          throw error;
        }
        throw SigningError.fromError(
          error,
          'Could not sign the signer ownership challenge',
        );
      }
      if (Number(message.expiresAt) * 1000 <= Date.now()) {
        throw new UnexpectedResponseError(
          'The signer ownership challenge expired before login.',
        );
      }
      const startedAt = Date.now();
      const loginResponse = await unwrap(
        gateway.post('/v1/auth/login', {
          json: {
            ownership: {
              challenge_id: challenge.challengeId,
              signature,
              wallet,
            },
          },
          timeout: 10_000,
        }),
      );
      return sessionCredentials(
        await readIdentityResponse(loginResponse, PredictionsTokensSchema),
        startedAt,
      );
    },
    async refresh(refreshToken) {
      const startedAt = Date.now();
      const response = await unwrap(
        gateway.post('/v1/auth/refresh', {
          json: { refresh_token: refreshToken },
          timeout: 10_000,
        }),
      );
      const tokens = await readIdentityResponse(
        response,
        PredictionsTokensSchema,
      );
      if (tokens.refreshToken !== refreshToken) {
        throw new UnexpectedResponseError(
          'The refresh response changed the session refresh token.',
        );
      }
      return sessionCredentials(tokens, startedAt);
    },
    async fetchIdentity(accessToken) {
      const response = await unwrap(
        gateway.get('/next/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10_000,
        }),
      );
      const identity = await readIdentityResponse(
        response,
        PredictionsIdentitySchema,
      );
      if (
        !isSameEvmAddress(identity.signer, signerAddress) ||
        !identity.wallet ||
        !isSameEvmAddress(identity.wallet, wallet) ||
        identity.signatureType !== signatureType
      ) {
        throw new UnexpectedResponseError(
          'The session identity does not match this client.',
        );
      }
      return identity;
    },
    async logout(refreshToken) {
      const response = await unwrap(
        gateway.post('/v1/auth/logout', {
          json: { refresh_token: refreshToken },
          timeout: 10_000,
        }),
      );
      if (response.status !== 204) {
        throw new UnexpectedResponseError(
          'The logout response did not confirm that the session ended.',
        );
      }
    },
  });
}

function sessionCredentials(
  tokens: PredictionsTokens,
  startedAt: number,
): PredictionsSessionCredentials {
  const lifetimeMs = tokens.expiresIn * 1000;
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    refreshAt: startedAt + lifetimeMs - Math.min(30_000, lifetimeMs / 2),
    refreshExpiresAt: startedAt + tokens.refreshExpiresIn * 1000,
  };
}

async function readIdentityResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new UnexpectedResponseError('Received an invalid identity response.');
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    // Authentication payloads contain credentials. Do not attach them to errors.
    throw new UnexpectedResponseError(
      'Received an incompatible identity response.',
    );
  }
  return parsed.data;
}
