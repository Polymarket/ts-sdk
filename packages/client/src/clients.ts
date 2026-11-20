import {
  type AccessTokenClaims,
  AccessTokenResponseSchema,
  type BearerCredentials,
  EvmAddressSchema,
  type TokenResponse,
  TokenResponseSchema,
} from '@polymarket/bindings';
import { WalletType } from '@polymarket/bindings/gamma';
import {
  type EvmAddress,
  expectEvmAddress,
  invariant,
  isSameEvmAddress,
  type Prettify,
} from '@polymarket/types';
import { z } from 'zod';
import { AuthenticatedServiceClient } from './AuthenticatedServiceClient';
import {
  type DeployDepositWalletError,
  deployDepositWallet,
  type IsWalletDeployedError,
  isWalletDeployed,
  type WaitForGaslessTransactionError,
} from './actions/gasless';
import {
  AuthenticationInputSchema,
  issueLoginSession,
  issueMigratedSession,
  type LoginRequest,
  login,
  type MigrateCredentialsRequest,
  migrateCredentials,
} from './actions/identity';
import { createClientMetadata } from './client-metadata';
import {
  ClientCredentialsSchema,
  type CredentialsChanged,
} from './credentials';
import {
  allActions,
  type PublicActions,
  type SecureActions,
} from './decorators';
import { type EnvironmentConfig, production } from './environments';
import {
  CancelledSigningError,
  makeErrorGuard,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from './errors';
import { parseUserInput } from './input';
import { predictionSigningRequest } from './prediction-signing';
import type { RateLimitUpdateListener } from './rate-limit';
import { protectRequestErrors, redactRequestError } from './request-errors';
import type { Fetch } from './request-options';
import { JsonRpcClient } from './rpc';
import type { RequestHeadersResolver, ServiceRequest } from './ServiceClient';
import { ServiceClient } from './ServiceClient';
import { AuthSession, accessTokenClaims } from './session';
import type { ApiKeyAuthorization, Signer } from './types';
import type { AccountIdentity } from './wallet';
import {
  deriveBeaconDepositWalletAddress,
  deriveUupsDepositWalletAddress,
  resolveAccountIdentity,
} from './wallet';
import {
  ClobMarketWebSocketManager,
  ClobUserWebSocketManager,
  PerpsSessionManager,
  PerpsSubscriptionManager,
  type PublicWebSocketManagers,
  RealtimeWebSocketManager,
  RfqQuoterWebSocketManager,
  RtdsWebSocketManager,
  type SecureWebSocketManagers,
  SportsWebSocketManager,
} from './websockets';

type PublicContext = {
  /** @internal */
  fetch?: Fetch;
  /** @internal */
  apiKey?: ApiKeyAuthorization;
  /** @internal */
  environment: EnvironmentConfig;
  /** @internal */
  onRateLimitUpdate?: RateLimitUpdateListener;
  /** @internal */
  predictions: ServiceClient;
  /** @internal */
  auth: ServiceClient;
  /** @internal */
  rpc: JsonRpcClient;
  /** @internal */
  perps: ServiceClient;
  /** @internal */
  webSockets: PublicWebSocketManagers;
};

// biome-ignore lint/complexity/noBannedTypes: intentional
export type ClientActions = {};

export type ClientDecorator<
  TPublicActions extends ClientActions = ClientActions,
  TSecureActions extends ClientActions = TPublicActions,
> = {
  (client: BasePublicClient<ClientActions, ClientActions>): TPublicActions;
  (client: BaseSecureClient<ClientActions, ClientActions>): TSecureActions;
};

type DecoratorPublicActions<TDecorator extends ClientDecorator> =
  TDecorator extends ClientDecorator<
    infer TPublicActions,
    infer _TSecureActions
  >
    ? TPublicActions
    : never;

type DecoratorSecureActions<TDecorator extends ClientDecorator> =
  TDecorator extends ClientDecorator<
    infer _TPublicActions,
    infer TSecureActions
  >
    ? TSecureActions
    : never;

/** Adds API-key headers to the Predictions operations that the key's credential family covers. */
function authorizePredictionsRequest(
  context: PublicContext,
  request: ServiceRequest,
): Promise<HeadersInit> {
  const apiKey = context.apiKey;
  const signing =
    apiKey === undefined
      ? undefined
      : predictionSigningRequest(request, apiKey);
  if (apiKey === undefined || signing === undefined) return Promise.resolve({});
  return apiKey.authorize(signing, {
    fetch: context.fetch,
    signal: request.signal,
  });
}

abstract class AbstractClient<TContext extends PublicContext> {
  // Keep the backing context off the public object shape so accidental
  // client logs do not print secure credentials.
  readonly #context: TContext;
  readonly #decorators: ClientDecorator[];

  protected get context(): TContext {
    return this.#context;
  }

  protected get decorators(): readonly ClientDecorator[] {
    return this.#decorators;
  }

  /** @internal */
  get environment(): EnvironmentConfig {
    return this.context.environment;
  }

  /**
   * Service client for prediction requests using the configured endpoint.
   * Requests return promises with parsed response data.
   *
   * @experimental For the polymarket.com UI. External consumers should not adopt this API. Breaking changes may occur in any release, including patch releases.
   */
  get predictions(): ServiceClient {
    return this.context.predictions;
  }

  /** @internal */
  get auth(): ServiceClient {
    return this.context.auth;
  }

  /** @internal */
  get rpc(): JsonRpcClient {
    return this.context.rpc;
  }

  /** @internal */
  get perps(): ServiceClient {
    return this.context.perps;
  }

  /** @internal Shared managers for realtime subscriptions. */
  get webSockets(): PublicWebSocketManagers {
    return this.context.webSockets;
  }

  /** @internal Application-key adapter the client is configured with. */
  get apiKey(): ApiKeyAuthorization | undefined {
    return this.context.apiKey;
  }

  /** @internal Fetch implementation the client is configured with. */
  get fetch(): Fetch | undefined {
    return this.context.fetch;
  }

  /** @internal */
  get supportsGasless(): boolean {
    return this.context.apiKey?.supportGasless ?? false;
  }

  /** @internal */
  get hasBuilderApiKey(): boolean {
    return this.context.apiKey?.isBuilderKey ?? false;
  }

  constructor(context: TContext) {
    this.#context = context;
    this.#decorators = [];
  }

  protected resolveRequestHeaders(
    request: ServiceRequest,
  ): Promise<HeadersInit> {
    return authorizePredictionsRequest(this.context, request);
  }

  protected rememberDecorator(decorator: ClientDecorator): void {
    this.#decorators.push(decorator);
  }
}

export type { ClientCredentials } from './credentials';

const SecureClientInputSchema = AuthenticationInputSchema.omit({
  verificationToken: true,
})
  .extend({
    credentials: ClientCredentialsSchema.optional(),
    walletSetup: z.boolean().optional(),
    onCredentialsChanged: z
      .custom<CredentialsChanged>((value) => typeof value === 'function')
      .optional(),
  })
  .refine(
    (value) => value.credentials === undefined || value.nonce === undefined,
    {
      path: ['nonce'],
      message: '`credentials` and `nonce` are mutually exclusive.',
    },
  );

type PublicClientConfig = {
  fetch?: Fetch;
  environment: EnvironmentConfig;
  apiKey?: ApiKeyAuthorization;
  onRateLimitUpdate?: RateLimitUpdateListener;
};

async function resolveGatewayHeaders(
  config: PublicClientConfig,
  request: ServiceRequest,
  existingHeaders?: HeadersInit,
): Promise<Headers> {
  const headers = new Headers(existingHeaders);
  // Attribution is bound to the session. Refresh/logout need no application key exchange.
  if (request.path === '/v1/auth/refresh' || request.path === '/v1/auth/logout')
    return headers;
  const gateway = await config.apiKey?.authorizeGateway?.({
    fetch: config.fetch,
    signal: request.signal,
  });
  for (const [key, value] of new Headers(gateway)) headers.set(key, value);
  return headers;
}

function createAuthService(config: PublicClientConfig): ServiceClient {
  return new ServiceClient({
    fetch: protectRequestErrors(config.fetch, true),
    root: config.environment.predictions.rest,
    headers: config.environment.predictions.headers,
    resolveHeaders: async (request) => {
      const headers = await resolveGatewayHeaders(config, request);
      headers.set('POLYMARKET_CLIENT', createClientMetadata());
      return headers;
    },
  });
}

// Public requests resolve API-key headers without an authentication lifecycle.
function createPredictionsService(
  config: PublicClientConfig,
  resolveHeaders: RequestHeadersResolver,
): ServiceClient {
  const metadata = createClientMetadata();
  return new ServiceClient({
    fetch: protectRequestErrors(config.fetch),
    headers: config.environment.predictions.headers,
    root: config.environment.predictions.rest,
    onRateLimitUpdate: config.onRateLimitUpdate,
    resolveHeaders: async (request) => {
      const headers = await resolveGatewayHeaders(
        config,
        request,
        await resolveHeaders?.(request),
      );
      headers.set('POLYMARKET_CLIENT', metadata);
      return headers;
    },
  });
}

class BasePublicClient<
  TPublicActions extends ClientActions = ClientActions,
  TSecureActions extends ClientActions = TPublicActions,
> extends AbstractClient<PublicContext> {
  constructor(config: PublicClientConfig) {
    super({
      apiKey: config.apiKey,
      environment: config.environment,
      fetch: config.fetch,
      onRateLimitUpdate: config.onRateLimitUpdate,
      predictions: createPredictionsService(config, (request) =>
        this.resolveRequestHeaders(request),
      ),
      auth: createAuthService(config),
      perps: new ServiceClient({
        fetch: config.fetch,
        headers: config.environment.perps.headers,
        root: config.environment.perps.rest,
      }),
      rpc: new JsonRpcClient({
        url: config.environment.rpc,
        fetch: config.fetch,
      }),
      webSockets: {
        clobMarket: new ClobMarketWebSocketManager({
          headers: config.environment.clob.market.headers,
          url: config.environment.clob.market.ws,
        }),
        sports: new SportsWebSocketManager({
          headers: config.environment.sports.headers,
          url: config.environment.sports.ws,
        }),
        rtds: new RtdsWebSocketManager({
          headers: config.environment.rtds.headers,
          url: config.environment.rtds.ws,
        }),
        perpsSubscriptions: new PerpsSubscriptionManager({
          headers: config.environment.perps.headers,
          url: config.environment.perps.ws,
        }),
      },
    });
  }

  /**
   * Use this to narrow a {@link Client} union to {@link SecureClient}.
   *
   * @example
   * ```ts
   * if (client.isSecureClient()) {
   *   client.credentials; // SecureClient
   * }
   * ```
   */
  isSecureClient(): this is BaseSecureClient<TPublicActions, TSecureActions> {
    return false;
  }

  /**
   * Use this to narrow a {@link Client} union to {@link PublicClient}.
   *
   * @example
   * ```ts
   * if (client.isPublicClient()) {
   *   client.closeSubscriptions(); // PublicClient
   * }
   * ```
   */
  isPublicClient(): this is BasePublicClient<TPublicActions, TSecureActions> {
    return true;
  }

  /**
   * Closes all active realtime subscriptions owned by this client.
   *
   * @remarks
   * This ends active subscription iterators and closes shared websocket
   * connections. It does not affect authentication or other client state.
   *
   * @example
   * ```ts
   * await client.closeSubscriptions();
   * ```
   */
  async closeSubscriptions(): Promise<void> {
    await Promise.all([
      this.webSockets.clobMarket.close(),
      this.webSockets.rtds.close(),
      this.webSockets.sports.close(),
      this.webSockets.perpsSubscriptions.close(),
    ]).then(() => undefined);
  }

  /**
   * Returns a client typed with the methods contributed by the decorator.
   */
  extend<TDecorator extends ClientDecorator>(
    decorator: TDecorator,
  ): PublicClient<
    Prettify<TPublicActions & DecoratorPublicActions<TDecorator>>,
    Prettify<TSecureActions & DecoratorSecureActions<TDecorator>>
  > {
    this.rememberDecorator(decorator);
    Object.assign(this, decorator(this));
    return this as unknown as PublicClient<
      Prettify<TPublicActions & DecoratorPublicActions<TDecorator>>,
      Prettify<TSecureActions & DecoratorSecureActions<TDecorator>>
    >;
  }

  /** Opens a bearer session by signing a server-issued ownership challenge.
   * @throws {@link LoginError} Thrown on authentication failure.
   * @experimental May change without notice.
   */
  login(request: LoginRequest): Promise<BearerCredentials> {
    return login(this, request);
  }

  /** Migrates saved L2 credentials without a new wallet signature.
   * @throws {@link MigrateCredentialsError} Thrown on migration failure.
   * @experimental May change without notice.
   */
  migrateCredentials(
    request: MigrateCredentialsRequest,
  ): Promise<BearerCredentials> {
    return migrateCredentials(this, request);
  }

  /** Constructs a client after its authentication workflow has resolved. @internal */
  createAuthenticatedClient(
    credentials: BearerCredentials,
    expiresIn: number | undefined,
    account: AccountIdentity,
    signer: Signer,
    onCredentialsChanged?: CredentialsChanged,
  ): SecureClient<TPublicActions, TSecureActions> {
    const client = new BaseSecureClient({
      onCredentialsChanged,
      account: account,
      apiKey: this.context.apiKey,
      credentials,
      expiresIn,
      environment: this.environment,
      onRateLimitUpdate: this.context.onRateLimitUpdate,
      fetch: this.context.fetch,
      signer,
    });

    for (const decorator of this.decorators) {
      client.extend(decorator);
    }

    return client as SecureClient<TPublicActions, TSecureActions>;
  }
}

export type EndAuthenticationError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const EndAuthenticationError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

export type RefreshCredentialsError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError;
export const RefreshCredentialsError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
);

export type UpgradeCredentialsRequest = {
  /** Wallet to bind to the session, such as a Deposit Wallet the application has deployed. */
  wallet: string;
};
const UpgradeCredentialsRequestSchema = z.object({ wallet: EvmAddressSchema });

export type UpgradeCredentialsError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const UpgradeCredentialsError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

class BaseSecureClient<
  TPublicActions extends ClientActions = ClientActions,
  TSecureActions extends ClientActions = TPublicActions,
> extends AbstractClient<SecureContext> {
  #hasEndedAuthentication = false;
  #upgrading = false;
  readonly #requestTokens = new WeakMap<AbortSignal, string>();
  #endingAuthentication:
    | Promise<PublicClient<TPublicActions, TSecureActions>>
    | undefined;

  /**
   * @remarks This is the choking point for all requests, so we can ensure that once
   * `endAuthentication` is called, no further authenticated requests can be made with this client instance.
   */
  protected override get context(): SecureContext {
    invariant(
      !this.#hasEndedAuthentication,
      'This client has ended authentication and is closed.',
    );

    return super.context;
  }

  protected endAuthenticationLifecycle(): void {
    this.#hasEndedAuthentication = true;
  }

  constructor(config: SecureClientConfig) {
    const auth = createAuthService(config);
    const metadata = createClientMetadata();
    let predictions: AuthenticatedServiceClient;
    const session = new AuthSession({
      credentials: config.credentials,
      expiresIn: config.expiresIn,
      onCredentialsChanged: config.onCredentialsChanged,
      refresh: (credentials, signal) =>
        predictions.post('/v1/auth/refresh', {
          json: { refresh_token: credentials.refreshToken },
          schema: TokenResponseSchema,
          signal,
        }),
    });
    let account = config.account;
    // Another client sharing this refresh session can bind a wallet. Follow
    // the wallet the server issued so the account matches the session.
    session.onChange(() => {
      const { wallet } = session.claims;
      if (wallet !== undefined && !isSameEvmAddress(wallet, account.wallet))
        account = resolveAccountIdentity(
          config.environment,
          account.signer,
          wallet,
        );
    });
    function ownedSecrets(): string[] {
      return Object.values(session.credentials);
    }
    const protectedFetch = protectRequestErrors(
      config.fetch,
      false,
      ownedSecrets,
    );
    predictions = new AuthenticatedServiceClient({
      fetch: protectedFetch,
      headers: config.environment.predictions.headers,
      root: config.environment.predictions.rest,
      onRateLimitUpdate: config.onRateLimitUpdate,
      refreshToken: (signal) => this.refreshTokens(signal),
      resolveHeaders: async (request) => {
        const headers = new Headers(await this.resolveRequestHeaders(request));
        headers.set('POLYMARKET_CLIENT', metadata);
        return headers;
      },
    });
    const realtime = new RealtimeWebSocketManager({
      url: config.environment.realtime.ws,
      headers: config.environment.realtime.headers,
      session,
    });
    super({
      get account() {
        return account;
      },
      session,
      apiKey: config.apiKey,
      environment: config.environment,
      fetch: config.fetch,
      onRateLimitUpdate: config.onRateLimitUpdate,
      signer: config.signer,
      predictions,
      auth,
      rpc: new JsonRpcClient({
        url: config.environment.rpc,
        fetch: config.fetch,
      }),
      perps: new ServiceClient({
        fetch: config.fetch,
        headers: config.environment.perps.headers,
        root: config.environment.perps.rest,
      }),
      webSockets: {
        clobMarket: new ClobMarketWebSocketManager({
          headers: config.environment.clob.market.headers,
          url: config.environment.clob.market.ws,
        }),
        clobUser: new ClobUserWebSocketManager({
          session,
          headers: config.environment.clob.user.headers,
          url: config.environment.clob.user.ws,
        }),
        rfqQuoter: new RfqQuoterWebSocketManager({
          account: () => account,
          chainId: config.environment.chainId,
          session,
          exchange: config.environment.contracts.exchangeV3,
          headers: config.environment.combos.headers,
          signer: config.signer,
          url: config.environment.combos.ws,
        }),
        sports: new SportsWebSocketManager({
          headers: config.environment.sports.headers,
          url: config.environment.sports.ws,
        }),
        realtime,
        rtds: new RtdsWebSocketManager({
          headers: config.environment.rtds.headers,
          url: config.environment.rtds.ws,
        }),
        perpsSubscriptions: new PerpsSubscriptionManager({
          headers: config.environment.perps.headers,
          url: config.environment.perps.ws,
        }),
        perpsSession: new PerpsSessionManager({
          fetch: config.fetch,
          chainId: config.environment.chainId,
          headers: config.environment.perps.headers,
          restUrl: config.environment.perps.rest,
          wsUrl: config.environment.perps.ws,
        }),
      },
    });
  }

  override get predictions(): AuthenticatedServiceClient {
    return this.context.predictions;
  }

  protected override async resolveRequestHeaders(
    request: ServiceRequest,
  ): Promise<HeadersInit> {
    const context = request.path.startsWith('/v1/auth/')
      ? super.context
      : this.context;
    return this.resolveSecureHeaders(request, async (request) =>
      resolveGatewayHeaders(
        context,
        request,
        await authorizePredictionsRequest(context, request),
      ),
    );
  }

  protected async resolveSecureHeaders(
    request: ServiceRequest,
    resolveHeaders?: RequestHeadersResolver,
  ): Promise<HeadersInit> {
    const context = request.path.startsWith('/v1/auth/')
      ? super.context
      : this.context;
    const session = context.session;
    try {
      // Refresh itself must never await the rotation it is completing.
      const credentials = request.path.startsWith('/v1/auth/')
        ? session.credentials
        : await session.ready(request.signal);
      const headers = new Headers(await resolveHeaders?.(request));
      headers.set('Authorization', `Bearer ${credentials.accessToken}`);
      if (request.signal !== undefined)
        this.#requestTokens.set(request.signal, credentials.accessToken);
      return headers;
    } catch (error) {
      throw redactRequestError(error, Object.values(session.credentials));
    }
  }

  protected async refreshTokens(signal?: AbortSignal): Promise<boolean> {
    const session = this.context.session;
    const previous =
      signal === undefined ? undefined : this.#requestTokens.get(signal);
    await session.recover(previous ?? session.credentials.accessToken, signal);
    return true;
  }

  /**
   * API credentials for the authenticated session.
   *
   * @remarks
   * Contains the access and refresh tokens for bearer authentication.
   * These credentials are sensitive. Store them securely if you want to create
   * another secure client later without requiring a new authentication signature
   * while the credentials remain valid.
   */
  get credentials(): BearerCredentials {
    return this.session.credentials;
  }

  /**
   * Renews the session now and returns the renewed credentials.
   *
   * @remarks
   * The client renews its session before the access token expires, so most
   * applications never call this. Use it to renew on your own schedule, such as
   * when a suspended browser tab becomes visible again or before a long-lived
   * process persists its credentials. A call made while a renewal is in
   * progress joins it instead of starting another one. `onCredentialsChanged`
   * receives the renewed pair. A failure that ends the session rejects this
   * call and every later authenticated request.
   *
   * @example
   * ```ts
   * const credentials = await client.refreshCredentials();
   * ```
   * @throws {@link RefreshCredentialsError} Thrown if the session cannot be renewed.
   * @experimental May change without notice.
   */
  async refreshCredentials(): Promise<BearerCredentials> {
    return this.session.refresh();
  }

  /**
   * Binds a wallet to this client's session when the session has none and
   * returns the new credentials.
   *
   * @remarks
   * Use this after creating the client with `walletSetup: false` and
   * completing your own onboarding, such as deploying the Deposit Wallet.
   * Binding needs no new signature and keeps the refresh token. This client
   * stays open: `account` switches to `wallet`, subscriptions stay open, and
   * `onCredentialsChanged` receives the new access token. A session already
   * bound to `wallet` returns its current credentials without a request. A
   * session bound to a different wallet is rejected. If binding fails, the
   * client keeps its current session.
   *
   * @example
   * ```ts
   * const credentials = await secureClient.upgradeCredentials({ wallet });
   * await saveCredentials(credentials);
   * ```
   * @throws {@link UpgradeCredentialsError} Thrown if the wallet cannot be bound.
   * @experimental May change without notice.
   */
  async upgradeCredentials(
    request: UpgradeCredentialsRequest,
  ): Promise<BearerCredentials> {
    const { wallet } = parseUserInput(request, UpgradeCredentialsRequestSchema);
    const { auth, environment, session } = this.context;
    // Validate the wallet identity before the session changes.
    resolveAccountIdentity(environment, this.account.signer, wallet);
    if (this.#upgrading)
      throw new UserInputError('A credential upgrade is already in progress.');
    const bound = session.claims.wallet;
    if (bound !== undefined) {
      if (!isSameEvmAddress(bound, wallet))
        throw new UserInputError(
          `The session is already bound to wallet ${bound}.`,
        );
      return session.credentials;
    }
    this.#upgrading = true;
    try {
      // Adopting the bound token moves `account` to the wallet and
      // re-authenticates open subscriptions.
      await session.bindWallet(wallet, (accessToken) =>
        auth.post('/v1/auth/upgrade', {
          headers: { Authorization: `Bearer ${accessToken}` },
          json: { wallet },
          schema: AccessTokenResponseSchema,
        }),
      );
    } finally {
      this.#upgrading = false;
    }
    return session.credentials;
  }

  /** @internal */
  get session(): AuthSession {
    return this.context.session;
  }

  /** @internal */
  closeAuthenticationSession(): void {
    this.context.session.close();
  }

  /**
   * The authenticated account identity associated with this client, including the signer and wallet addresses and wallet type.
   */
  get account(): AccountIdentity {
    return this.context.account;
  }

  /** @internal */
  get signer(): Signer {
    return this.context.signer;
  }

  /** @internal Shared managers for public and authenticated realtime subscriptions. */
  override get webSockets(): SecureWebSocketManagers {
    return this.context.webSockets;
  }

  /**
   * Closes all active realtime subscriptions owned by this client.
   *
   * @remarks
   * Secure clients also close authenticated user-stream subscriptions. This
   * ends active subscription iterators and closes shared websocket connections.
   * It does not affect authentication or other client state.
   *
   * @example
   * ```ts
   * await client.closeSubscriptions();
   * ```
   */
  async closeSubscriptions(): Promise<void> {
    await Promise.allSettled([
      this.webSockets.clobMarket.close(),
      this.webSockets.realtime.close(),
      this.webSockets.rtds.close(),
      this.webSockets.sports.close(),
      this.webSockets.perpsSubscriptions.close(),
      this.webSockets.clobUser.close(),
    ]).then(() => undefined);
  }

  /**
   * Use this to narrow a {@link Client} union to {@link SecureClient}.
   *
   * @example
   * ```ts
   * if (client.isSecureClient()) {
   *   client.credentials; // SecureClient
   * }
   * ```
   */
  isSecureClient(): this is BaseSecureClient<TPublicActions, TSecureActions> {
    return true;
  }

  /**
   * Use this to narrow a {@link Client} union to {@link PublicClient}.
   *
   * @example
   * ```ts
   * if (client.isPublicClient()) {
   *   client.closeSubscriptions(); // PublicClient
   * }
   * ```
   */
  isPublicClient(): this is BasePublicClient<TPublicActions, TSecureActions> {
    return false;
  }

  /**
   * Returns a secure client typed with the methods contributed by the decorator.
   */
  extend<TDecorator extends ClientDecorator>(
    decorator: TDecorator,
  ): SecureClient<
    TPublicActions,
    Prettify<TSecureActions & DecoratorSecureActions<TDecorator>>
  > {
    this.rememberDecorator(decorator);
    Object.assign(this, decorator(this));

    return this as unknown as SecureClient<
      TPublicActions,
      Prettify<TSecureActions & DecoratorSecureActions<TDecorator>>
    >;
  }

  /**
   * Ends authentication for this client and returns a public client.
   *
   * @remarks
   * This closes the current `SecureClient` and its local consumers and ends
   * its session, so its refresh token stops working. Access tokens that were
   * already issued stay valid until they expire. An expired access token is
   * renewed solely for revocation. L2 credentials that were migrated into the
   * session are not revoked. Concurrent calls share one logout operation, and
   * local cleanup completes even when revocation fails.
   *
   * @example
   * ```ts
   * const publicClient = await secureClient.endAuthentication();
   * ```
   * @throws {@link EndAuthenticationError} Thrown if remote logout fails; local cleanup still completes.
   */
  endAuthentication(): Promise<PublicClient<TPublicActions, TSecureActions>> {
    this.#endingAuthentication ??= this.#endAuthentication();
    return this.#endingAuthentication;
  }

  async #endAuthentication(): Promise<
    PublicClient<TPublicActions, TSecureActions>
  > {
    // Server-side revocation must not depend on local WebSocket cleanup.
    const closingResources = Promise.allSettled([
      this.closeSubscriptions(),
      this.webSockets.perpsSession.shutdown(),
      this.webSockets.rfqQuoter.shutdown(),
    ]);
    const { apiKey, environment, onRateLimitUpdate, fetch, session, auth } =
      this.context;
    this.endAuthenticationLifecycle();

    try {
      await session.logout((accessToken) =>
        auth.post('/v1/auth/logout', {
          headers: { Authorization: `Bearer ${accessToken}` },
          responseType: 'empty',
        }),
      );
    } finally {
      this.endAuthenticationLifecycle();
      session.close();
      await closingResources;
    }

    const client = new BasePublicClient({
      apiKey,
      environment,
      onRateLimitUpdate,
      fetch,
    });

    for (const decorator of this.decorators) {
      client.extend(decorator);
    }

    return client as PublicClient<TPublicActions, TSecureActions>;
  }
}

type SecureContext = PublicContext & {
  predictions: AuthenticatedServiceClient;
  /** @internal */
  account: AccountIdentity;
  /** @internal */
  session: AuthSession;
  /** @internal */
  signer: Signer;
  /** @internal */
  webSockets: SecureWebSocketManagers;
};

type SecureClientConfig = PublicClientConfig & {
  account: AccountIdentity;
  credentials: BearerCredentials;
  /** Access-token lifetime in seconds for sessions issued by this client creation. */
  expiresIn?: number;
  onCredentialsChanged?: CredentialsChanged;
  signer: Signer;
};

export type PublicClient<
  TPublicActions extends ClientActions = PublicActions,
  TSecureActions extends ClientActions = SecureActions,
> = BasePublicClient<TPublicActions, TSecureActions> & TPublicActions;

export type SecureClient<
  TPublicActions extends ClientActions = PublicActions,
  TSecureActions extends ClientActions = SecureActions,
> = BaseSecureClient<TPublicActions, TSecureActions> & TSecureActions;

export { BasePublicClient, BaseSecureClient };

export type BaseClient<
  TPublicActions extends ClientActions = ClientActions,
  TSecureActions extends ClientActions = TPublicActions,
> =
  | BasePublicClient<TPublicActions, TSecureActions>
  | BaseSecureClient<TPublicActions, TSecureActions>;

export type Client<
  TPublicActions extends ClientActions = ClientActions,
  TSecureActions extends ClientActions = TPublicActions,
> =
  | PublicClient<TPublicActions, TSecureActions>
  | SecureClient<TPublicActions, TSecureActions>;

export type PublicClientOptions = {
  /**
   * Fetch-compatible implementation for SDK-owned HTTP requests. Defaults to native fetch.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  fetch?: Fetch;
  /**
   * The environment configuration used by the client.
   *
   * @defaultValue `production`
   */
  environment?: EnvironmentConfig;

  /**
   * Optional request authorization applied by the client when needed:
   * `platformApiKey` or `remotePlatformApiKey` for application attribution, or
   * `builderApiKey`, `relayerApiKey` or `remoteBuilderSigning` for builder and
   * submission authorization.
   */
  apiKey?: ApiKeyAuthorization;

  /**
   * Listener invoked whenever a response reports per-signer rate-limit state,
   * as order and cancellation responses do.
   *
   * @remarks
   * Use this to monitor remaining rate-limit capacity and warning-mode
   * signals, and adjust request patterns before requests are rejected.
   * Errors thrown by the listener and rejections from promises it returns are
   * ignored.
   */
  onRateLimitUpdate?: RateLimitUpdateListener;
};

export type SecureClientOptions = PublicClientOptions & {
  /**
   * Wallet address to use as the account wallet.
   *
   * If omitted, the client uses the signer's deterministic Deposit Wallet.
   * Saved credentials that are already bound to a wallet keep that wallet, and
   * passing a different one is rejected. Saved credentials without a wallet
   * are bound to this wallet without a new signature.
   * Pass the signer address itself to explicitly trade as
   * an EOA account, or pass a supported Poly Deposit Wallet, Poly Safe, or Poly
   * Proxy wallet address to use that wallet as the account/funder.
   */
  wallet?: string;

  /**
   * Wallet-library adapter used to authenticate and complete wallet operations.
   */
  signer: Signer;
  /** Called after adoption of a refreshed token pair. Sync/async failures are ignored; handle persistence failures inside the callback. */
  onCredentialsChanged?: CredentialsChanged;
  /**
   * Whether client creation completes wallet setup: wallet discovery, binding
   * a session that has no wallet, and deploying the default Deposit Wallet.
   *
   * Pass `false` to create the client from the session as it is, for example
   * when the application runs its own onboarding. A new sign-in or migration
   * then includes `wallet` only when you pass it. For a session without a
   * wallet, `account.wallet` is the `wallet` you pass, or otherwise the
   * signer's default Deposit Wallet address, which may not be deployed yet.
   * Once onboarding completes, call `secureClient.upgradeCredentials` to
   * bind the wallet, or create a client from the saved credentials with
   * wallet setup enabled.
   *
   * @defaultValue true
   * @experimental May change without notice.
   */
  walletSetup?: boolean;
} & (
    | {
        /**
         * Saved bearer tokens or L2 credentials from an earlier SDK version.
         * L2 credentials are exchanged for bearer tokens without a new wallet
         * signature. A failed migration or an ended bearer session rejects
         * creation without falling back to signing. Create the client without
         * credentials to sign in again.
         */
        credentials?: object;
        nonce?: never;
      }
    | {
        credentials?: never;
        /**
         * Selects which derived L2 credential set the authentication signature
         * also covers. The same nonce selects the same set.
         *
         * @defaultValue 0
         */
        nonce?: number;
      }
  );

/**
 * Creates a new `PublicClient` instance.
 *
 * @example
 * ```ts
 * const client = createPublicClient();
 * ```
 */
export function createPublicClient(
  options: PublicClientOptions = {},
): PublicClient<PublicActions, SecureActions> {
  return new BasePublicClient({
    environment: options.environment ?? production,
    apiKey: options.apiKey,
    onRateLimitUpdate: options.onRateLimitUpdate,
    fetch: options.fetch,
  }).extend(allActions);
}

export type CreateSecureClientError =
  | RequestAbortedError
  | CancelledSigningError
  | DeployDepositWalletError
  | IsWalletDeployedError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TimeoutError
  | TransactionFailedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError
  | WaitForGaslessTransactionError;
export const CreateSecureClientError = makeErrorGuard(
  RequestAbortedError,
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

export type SetupGaslessWalletError = UserInputError;
export const SetupGaslessWalletError = makeErrorGuard(UserInputError);

/**
 * Creates a new authenticated `SecureClient` instance.
 *
 * @remarks
 * Supplied L2 credentials are migrated without a new wallet signature. Migration
 * failures reject client creation. Saved bearer credentials are renewed once
 * before the client is returned, and credentials without a wallet are bound to
 * the requested wallet. The returned client always has an account wallet.
 * Pass `walletSetup: false` to skip wallet discovery, binding and deployment.
 * When sign-in requires a verification token, pass it to
 * `publicClient.login` or `publicClient.migrateCredentials` and create the
 * client from the returned credentials.
 *
 * @example
 * ```ts
 * const secureClient = await createSecureClient({
 *   signer,
 * });
 * ```
 *
 * @example
 * ```ts
 * const credentials = await publicClient.login({ signer, verificationToken });
 * await saveCredentials(credentials);
 *
 * const secureClient = await createSecureClient({
 *   signer,
 *   credentials,
 *   walletSetup: false,
 *   onCredentialsChanged: saveCredentials,
 * });
 * ```
 *
 * @throws {@link CreateSecureClientError}
 * Thrown on failure.
 */
export async function createSecureClient(
  options: SecureClientOptions,
): Promise<SecureClient<PublicActions, SecureActions>> {
  const client = createPublicClient({
    environment: options.environment,
    apiKey: options.apiKey,
    onRateLimitUpdate: options.onRateLimitUpdate,
    fetch: options.fetch,
  });
  const params = parseUserInput(options, SecureClientInputSchema);
  let address: string;
  try {
    address = await options.signer.getAddress();
  } catch {
    throw new SigningError('Could not obtain signer address.');
  }
  const signerAddress = parseUserInput(address, EvmAddressSchema);
  let credentials: BearerCredentials;
  let wallet: EvmAddress;
  let account: AccountIdentity;
  // Set for sessions issued by this call; restored sessions have no known lifetime.
  let issued: TokenResponse | undefined;
  let bindWallet = false;
  const walletSetup = params.walletSetup ?? true;
  const restored =
    params.credentials !== undefined && 'accessToken' in params.credentials;
  if (params.credentials !== undefined && 'accessToken' in params.credentials) {
    credentials = params.credentials;
    const claims = accessTokenClaims(credentials.accessToken);
    if (!isSameEvmAddress(claims.sub, signerAddress))
      throw new UserInputError(
        'The saved credentials belong to a different signer.',
      );
    if (claims.wallet === undefined) {
      if (walletSetup) {
        wallet = await resolveRequestedWallet(client, options, signerAddress);
        bindWallet = true;
      } else {
        wallet = params.wallet ?? defaultDepositWallet(client, signerAddress);
      }
    } else {
      if (
        params.wallet !== undefined &&
        !isSameEvmAddress(params.wallet, claims.wallet)
      )
        throw new UserInputError(
          `The saved credentials are bound to wallet ${claims.wallet}. Omit wallet or pass that wallet.`,
        );
      wallet = claims.wallet;
    }
    account = resolveAccountIdentity(client.environment, signerAddress, wallet);
  } else {
    // Without wallet setup, a new session carries only a wallet the caller names.
    const requested = walletSetup
      ? await resolveRequestedWallet(client, options, signerAddress)
      : params.wallet;
    wallet = requested ?? defaultDepositWallet(client, signerAddress);
    // Validate supported wallet identity before authentication has any side effects.
    account = resolveAccountIdentity(client.environment, signerAddress, wallet);
    issued =
      params.credentials !== undefined && 'key' in params.credentials
        ? await issueMigratedSession(client, {
            credentials: params.credentials,
            signerAddress,
            wallet: requested,
          })
        : await issueLoginSession(client, {
            signer: options.signer,
            wallet: requested,
            nonce: params.nonce,
          });
    credentials = {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
    };
    // A session issued without a requested wallet may still carry one.
    const issuedWallet =
      requested === undefined ? issuedWalletClaim(issued) : undefined;
    if (issuedWallet !== undefined) {
      wallet = issuedWallet;
      account = resolveAccountIdentity(
        client.environment,
        signerAddress,
        wallet,
      );
    }
  }
  let secureClient: SecureClient<PublicActions, SecureActions> | undefined;
  let publishCredentialChanges = restored;
  const { onCredentialsChanged } = params;
  let pendingCredentials: BearerCredentials | undefined;
  const notifyCredentialsChanged: CredentialsChanged = (next) => {
    if (!publishCredentialChanges) {
      pendingCredentials = next;
      return;
    }
    return onCredentialsChanged?.(next);
  };
  try {
    if (
      issued !== undefined &&
      !issuedFor(issued, signerAddress, walletSetup ? wallet : params.wallet)
    )
      throw new UnexpectedResponseError(
        'The issued session does not match the requested signer and wallet.',
      );

    secureClient = client.createAuthenticatedClient(
      credentials,
      issued?.expiresIn,
      account,
      options.signer,
      notifyCredentialsChanged,
    );
    if (restored) await secureClient.session.refresh();
    else await secureClient.session.ready();
    // Another client may have bound the saved session since it was stored.
    const boundWallet = secureClient.session.claims.wallet;
    if (
      bindWallet &&
      boundWallet !== undefined &&
      params.wallet !== undefined &&
      !isSameEvmAddress(boundWallet, params.wallet)
    )
      throw new UserInputError(
        `The saved credentials are bound to wallet ${boundWallet}. Omit wallet or pass that wallet.`,
      );
    if (bindWallet && boundWallet === undefined)
      await secureClient.session.bindWallet(wallet, (accessToken) =>
        client.auth.post('/v1/auth/upgrade', {
          headers: { Authorization: `Bearer ${accessToken}` },
          json: { wallet },
          schema: AccessTokenResponseSchema,
        }),
      );
    secureClient.session.start();
    // The session's wallet decides the account, including a wallet bound elsewhere.
    const sessionAccount = secureClient.account;
    if (walletSetup && sessionAccount.walletType !== WalletType.EOA) {
      const deployed = await isWalletDeployed(secureClient, {
        wallet: sessionAccount.wallet,
        type: sessionAccount.walletType,
      });
      if (!deployed) {
        if (sessionAccount.walletType === WalletType.DEPOSIT_WALLET)
          await deployDefaultDepositWallet(secureClient);
        else
          throw new UserInputError(
            `Wallet ${sessionAccount.wallet} does not exist. Provide an existing wallet address, or omit wallet to use the default Deposit Wallet flow.`,
          );
      }
    }
    const initialRotation = pendingCredentials;
    pendingCredentials = undefined;
    publishCredentialChanges = true;
    if (initialRotation !== undefined) {
      // Match session notifications: persistence failures must not reject a usable client.
      try {
        void Promise.resolve(onCredentialsChanged?.(initialRotation)).catch(
          () => undefined,
        );
      } catch {
        /* documented policy */
      }
    }
    return secureClient;
  } catch (error) {
    try {
      if (!restored) {
        if (secureClient !== undefined) await secureClient.endAuthentication();
        else
          await client.auth.post('/v1/auth/logout', {
            headers: { Authorization: `Bearer ${credentials.accessToken}` },
            responseType: 'empty',
          });
      } else if (secureClient !== undefined) {
        secureClient.closeAuthenticationSession();
        await secureClient.closeSubscriptions();
      }
    } catch {
      // Cleanup is best effort; retain the failure that prevented client creation.
    }
    throw error;
  }
}

/**
 * Checks that a login or migration issued a session for the requested signer
 * and, when one was requested, the requested wallet.
 */
function issuedFor(
  issued: TokenResponse,
  signer: EvmAddress,
  wallet: EvmAddress | undefined,
): boolean {
  let claims: AccessTokenClaims;
  try {
    claims = accessTokenClaims(issued.accessToken);
  } catch {
    return false;
  }
  if (!isSameEvmAddress(claims.sub, signer)) return false;
  if (wallet === undefined) return true;
  return claims.wallet !== undefined && isSameEvmAddress(claims.wallet, wallet);
}

/** Reads the wallet an issued session is bound to, if any. */
function issuedWalletClaim(issued: TokenResponse): EvmAddress | undefined {
  try {
    return accessTokenClaims(issued.accessToken).wallet;
  } catch {
    // An unreadable token fails the identity check after construction.
    return undefined;
  }
}

/** Derives the signer's current Deposit Wallet address without network access. */
function defaultDepositWallet(
  client: BasePublicClient,
  signerAddress: EvmAddress,
): EvmAddress {
  return deriveBeaconDepositWalletAddress(
    signerAddress,
    client.environment.walletDerivation,
  );
}

/** Resolves the wallet address to authenticate as. */
async function resolveRequestedWallet(
  client: BasePublicClient,
  options: SecureClientOptions,
  signerAddress: EvmAddress,
): Promise<EvmAddress> {
  if (options.wallet !== undefined) {
    return expectEvmAddress(options.wallet);
  }

  const legacyDepositWallet = deriveUupsDepositWalletAddress(
    signerAddress,
    client.environment.walletDerivation,
  );

  if (
    await isWalletDeployed(client, {
      wallet: legacyDepositWallet,
      type: WalletType.DEPOSIT_WALLET,
    })
  ) {
    return legacyDepositWallet;
  }

  return deriveBeaconDepositWalletAddress(
    signerAddress,
    client.environment.walletDerivation,
  );
}

/**
 * Deploys the signer's beacon Deposit Wallet for the secure client. The current
 * factory only deploys beacon wallets, so legacy UUPS wallets must already be
 * deployed and cannot be created through this path.
 */
async function deployDefaultDepositWallet(
  secureClient: SecureClient<PublicActions, SecureActions>,
): Promise<void> {
  const currentDepositWallet = deriveBeaconDepositWalletAddress(
    secureClient.account.signer,
    secureClient.environment.walletDerivation,
  );

  if (!isSameEvmAddress(secureClient.account.wallet, currentDepositWallet)) {
    throw new UserInputError(
      `Wallet ${secureClient.account.wallet} does not match the expected Deposit Wallet ${currentDepositWallet} for this signer, nor a deployed wallet address.`,
    );
  }

  const handle = await deployDepositWallet(secureClient);
  await handle.wait();
}
