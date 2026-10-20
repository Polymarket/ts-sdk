import type { BearerCredentials } from '@polymarket/bindings';
import { setNonBlockingTimeout } from '@polymarket/types';
import { RequestRejectedError, TransportError } from '../errors';
import { type AuthSession, accessTokenClaims } from '../session';

type SocketAuthenticationOptions = {
  session: AuthSession;
  authenticate: (accessToken: string) => Promise<void>;
  fail: (error: Error) => void;
  expired?: () => void;
};

/** Tracks the last acknowledged token independently of the HTTP session. @internal */
export class SocketAuthentication {
  readonly #options: SocketAuthenticationOptions;
  #active = false;
  #generation = 0;
  #deadline: ReturnType<typeof setTimeout> | undefined;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #cancelRetry: (() => void) | undefined;
  #unlisten: (() => void) | undefined;
  #unfail: (() => void) | undefined;
  #pending: string | undefined;
  #renewing = false;

  constructor(options: SocketAuthenticationOptions) {
    this.#options = options;
  }

  async prepare(): Promise<BearerCredentials> {
    return this.#options.session.ready();
  }

  accepted(token: string): void {
    this.#active = true;
    if (this.#unlisten === undefined) {
      this.#unlisten = this.#options.session.onChange(({ accessToken }) => {
        this.#pending = accessToken;
        void this.#renew();
      });
      this.#unfail = this.#options.session.onFailure((error) =>
        this.#options.fail(error),
      );
    }
    clearTimeout(this.#deadline);
    const delay = accessTokenClaims(token).exp * 1000 + 30_000 - Date.now();
    this.#deadline = setNonBlockingTimeout(
      () => {
        if (this.#options.expired !== undefined) {
          this.#options.expired();
          return;
        }
        this.#options.fail(
          new RequestRejectedError('WebSocket authentication expired.', {
            status: 401,
            code: 'expired_access_token',
          }),
        );
      },
      Math.min(2_147_483_647, Math.max(0, delay)),
    );
    // A refresh can complete while an initial/renewal acknowledgement is pending.
    const current = this.#options.session.credentials.accessToken;
    if (current !== token) {
      this.#pending = current;
      void this.#renew();
    }
  }

  async #renew(): Promise<void> {
    if (!this.#active || this.#renewing) return;
    this.#renewing = true;
    const generation = this.#generation;
    try {
      while (
        this.#pending !== undefined &&
        this.#active &&
        generation === this.#generation
      ) {
        const token = this.#pending;
        this.#pending = undefined;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (!this.#active || generation !== this.#generation) return;
          try {
            await this.#options.authenticate(token);
            if (generation === this.#generation && this.#active)
              this.accepted(token);
            break;
          } catch (error) {
            if (generation !== this.#generation || !this.#active) return;
            const transient =
              error instanceof TransportError ||
              (error instanceof RequestRejectedError &&
                error.code === 'auth_unavailable');
            if (!transient || attempt === 2) return; // Keep the accepted deadline on rejection.
            await new Promise<void>((resolve) => {
              this.#cancelRetry = resolve;
              this.#retry = setNonBlockingTimeout(resolve, 250 * 2 ** attempt);
            });
          }
        }
      }
    } finally {
      this.#renewing = false;
    }
  }

  stop(): void {
    this.#active = false;
    this.#generation++;
    this.#pending = undefined;
    clearTimeout(this.#deadline);
    clearTimeout(this.#retry);
    this.#cancelRetry?.();
    this.#cancelRetry = undefined;
    this.#unlisten?.();
    this.#unlisten = undefined;
    this.#unfail?.();
    this.#unfail = undefined;
  }
}
