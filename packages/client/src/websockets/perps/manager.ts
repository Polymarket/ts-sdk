import type { PerpsCredentials } from '@polymarket/bindings/perps';
import type { PerpsBuilderFeeApprover } from '../../actions/perps/builders';
import { TransportError } from '../../errors';
import type { Fetch } from '../../request-options';
import type { PerpsBuilderTermsInput } from './actions/builder-terms';
import { PerpsSession } from './session';

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsSessionManagerOptions = {
  chainId: number;
  fetch?: Fetch;
  headers?: Record<string, string>;
  retry?: boolean;
  restUrl: string;
  wsUrl: string;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export class PerpsSessionManager {
  readonly #chainId: number;
  readonly #fetch: Fetch | undefined;
  readonly #headers: Record<string, string> | undefined;
  readonly #retry: boolean | undefined;
  readonly #restUrl: string;
  readonly #wsUrl: string;
  readonly #sessions = new Set<PerpsSession>();
  readonly #connectingSessions = new Set<PerpsSession>();
  readonly #connecting = new Set<Promise<PerpsSession>>();
  #hasShutdown = false;

  /**
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  constructor(options: PerpsSessionManagerOptions) {
    this.#chainId = options.chainId;
    this.#fetch = options.fetch;
    this.#headers = options.headers;
    this.#retry = options.retry;
    this.#restUrl = options.restUrl;
    this.#wsUrl = options.wsUrl;
  }

  /**
   * Connects credentials with an optional builder for new orders.
   * Builder defaults belong to this session, not the credentials.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  connect(
    credentials: PerpsCredentials,
    builderAttribution?: string | PerpsBuilderTermsInput,
    approveBuilderFee?: PerpsBuilderFeeApprover,
    includeBuilderFills?: boolean,
  ): Promise<PerpsSession> {
    if (this.#hasShutdown) {
      return Promise.reject(
        new TransportError('Perps session manager has been shut down.'),
      );
    }

    const session = new PerpsSession({
      builderAttribution,
      approveBuilderFee,
      includeBuilderFills,
      chainId: this.#chainId,
      credentials,
      fetch: this.#fetch,
      headers: this.#headers,
      retry: this.#retry,
      onClose: (closedSession) => this.#clearSession(closedSession),
      restUrl: this.#restUrl,
      wsUrl: this.#wsUrl,
    });
    this.#connectingSessions.add(session);

    let connecting!: Promise<PerpsSession>;
    connecting = (async () => {
      try {
        await session.connect();
        if (this.#hasShutdown) {
          await session.close();
          throw new TransportError('Perps session manager has been shut down.');
        }
        this.#sessions.add(session);
        return session;
      } catch (error) {
        await session.close();
        throw error;
      } finally {
        this.#connecting.delete(connecting);
        this.#connectingSessions.delete(session);
      }
    })();

    this.#connecting.add(connecting);
    return connecting;
  }

  /**
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async shutdown(): Promise<void> {
    this.#hasShutdown = true;
    const sessions = Array.from(this.#sessions);
    const connectingSessions = Array.from(this.#connectingSessions);
    const connecting = Array.from(this.#connecting);

    this.#sessions.clear();
    this.#connectingSessions.clear();
    this.#connecting.clear();

    await Promise.allSettled([
      ...sessions.map((session) => session.close()),
      ...connectingSessions.map((session) => session.close()),
      ...connecting.map((promise) => promise.catch(() => undefined)),
    ]).then(() => undefined);
  }

  #clearSession(session: PerpsSession): void {
    this.#sessions.delete(session);
    this.#connectingSessions.delete(session);
  }
}
