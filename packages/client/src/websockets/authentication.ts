import type { BearerCredentials } from '@polymarket/bindings';
import { setNonBlockingTimeout } from '@polymarket/types';
import { RequestRejectedError, TransportError } from '../errors';
import type { AuthSession } from '../session';

type SocketAuthenticationOptions = {
  session: AuthSession;
  authenticate: (accessToken: string) => Promise<void>;
  fail: (error: Error) => void;
  /** Called when the last acknowledged token expires without a successful renewal. */
  expired: () => void;
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

  /**
   * Returns credentials for a new connection. A session that ended while the
   * connection was down cannot be recovered by reconnecting, so its failure
   * also runs `fail`.
   */
  async prepare(): Promise<BearerCredentials> {
    try {
      return await this.#options.session.ready();
    } catch (error) {
      const failure = this.#options.session.failure;
      if (failure !== undefined) this.#options.fail(failure);
      throw error;
    }
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
    const delay = this.#options.session.expiresAt(token) + 30_000 - Date.now();
    this.#deadline = setNonBlockingTimeout(
      () => this.#options.expired(),
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
            if (!transient || attempt === 2) break; // Keep the accepted deadline on rejection.
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
