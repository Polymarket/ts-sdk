import {
  type BearerCredentials,
  EvmAddressSchema,
  type OwnershipChallenge,
  type OwnershipChallengeRequest,
  OwnershipChallengeSchema,
  TokenResponseSchema,
} from '@polymarket/bindings';
import type { ApiKeyCreds } from '@polymarket/bindings/clob';
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
  type LoginRequest,
  login,
  type MigrateCredentialsRequest,
  migrateCredentials,
} from './actions/identity';
import { createClientMetadata } from './client-metadata';
import {
  type ClientCredentials,
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
import { buildHmacSignature } from './hmac';
import { parseUserInput } from './input';
import { predictionSigningRequest } from './prediction-signing';
import type { RateLimitUpdateListener } from './rate-limit';
import { protectRequestErrors } from './request-errors';
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
  /** @internal Direct service for credential administration; never uses bearer or platform authentication. */
  credentialManagement: ServiceClient;
  /** @internal */
  clob: ServiceClient;
  /** @internal */
  relayer: ServiceClient;
  /** @internal */
  rpc: JsonRpcClient;
  /** @internal */
  gamma: ServiceClient;
  /** @internal */
  data: ServiceClient;
  /** @internal */
  rfq: ServiceClient;
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
  get credentialManagement(): ServiceClient {
    return this.context.credentialManagement;
  }

  /** @internal */
  get clob(): ServiceClient {
    return this.context.clob;
  }

  /** @internal */
  get relayer(): ServiceClient {
    return this.context.relayer;
  }

  /** @internal */
  get rpc(): JsonRpcClient {
    return this.context.rpc;
  }

  /** @internal */
  get gamma(): ServiceClient {
    return this.context.gamma;
  }

  /** @internal */
  get data(): ServiceClient {
    return this.context.data;
  }

  /** @internal */
  get rfq(): ServiceClient {
    return this.context.rfq;
  }

  /** @internal */
  get perps(): ServiceClient {
    return this.context.perps;
  }

  /** @internal Shared managers for realtime subscriptions. */
  get webSockets(): PublicWebSocketManagers {
    return this.context.webSockets;
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

  protected async resolveClobHeaders(
    request: ServiceRequest,
  ): Promise<HeadersInit> {
    if (this.context.apiKey?.isBuilderKey) {
      return this.context.apiKey.authorize(request, {
        fetch: this.context.fetch,
        signal: request.signal,
      });
    }
    return Promise.resolve({});
  }

  protected resolveCredentialHeaders(
    request: ServiceRequest,
  ): Promise<HeadersInit> {
    // Builder-key revocation authenticates as the builder, not as its owner.
    if (request.path === '/auth/builder-api-key' && request.method === 'DELETE')
      return this.resolveClobHeaders(request);
    return Promise.resolve({});
  }

  protected async resolveRelayerHeaders(
    request: ServiceRequest,
  ): Promise<HeadersInit> {
    if (this.context.apiKey?.supportGasless) {
      return this.context.apiKey.authorize(request, {
        fetch: this.context.fetch,
        signal: request.signal,
      });
    }
    return Promise.resolve({});
  }

  protected resolveRequestHeaders(
    request: ServiceRequest,
  ): Promise<HeadersInit> {
    const canonical = predictionSigningRequest(request)?.request ?? request;
    return (
      this.context.apiKey?.authorize(canonical, {
        fetch: this.context.fetch,
        signal: request.signal,
      }) ?? Promise.resolve({})
    );
  }

  protected rememberDecorator(decorator: ClientDecorator): void {
    this.#decorators.push(decorator);
  }
}

export type { ClientCredentials } from './credentials';

const SecureClientInputSchema = AuthenticationInputSchema.extend({
  credentials: ClientCredentialsSchema.optional(),
  onCredentialsChanged: z
    .custom<CredentialsChanged>((value) => typeof value === 'function')
    .optional(),
}).refine(
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
    fetch: config.fetch,
    headers: config.environment.predictions.headers,
    root: config.environment.predictions.rest,
    onRateLimitUpdate: config.onRateLimitUpdate,
    resolveHeaders: async (request) => {
      const headers = await resolveGatewayHeaders(config, request, await resolveHeaders?.(request));
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
      credentialManagement: new ServiceClient({
        fetch: config.fetch,
        onRateLimitUpdate: config.onRateLimitUpdate,
        root: config.environment.clob.rest,
        headers: config.environment.clob.headers,
        resolveHeaders: (request) => this.resolveCredentialHeaders(request),
      }),
      data: new ServiceClient({
        fetch: config.fetch,
        headers: config.environment.data.headers,
        root: config.environment.data.rest,
      }),
      gamma: new ServiceClient({
        fetch: config.fetch,
        headers: config.environment.gamma.headers,
        root: config.environment.gamma.rest,
      }),
      clob: new ServiceClient({
        fetch: config.fetch,
        headers: config.environment.clob.headers,
        onRateLimitUpdate: config.onRateLimitUpdate,
        root: config.environment.clob.rest,
        resolveHeaders: (request) => this.resolveClobHeaders(request),
      }),
      relayer: new ServiceClient({
        fetch: config.fetch,
        headers: config.environment.relayer.headers,
        root: config.environment.relayer.rest,
        resolveHeaders: (request) => this.resolveRelayerHeaders(request),
      }),
      rfq: new ServiceClient({
        fetch: config.fetch,
        headers: config.environment.combos.headers,
        root: config.environment.combos.rest,
      }),
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

  /** @internal */
  assertCredentialMigrationSupported(): void {
    if (this.context.apiKey?.createChallenge !== undefined)
      throw new UserInputError(
        'Migrate L2 credentials on your server with platformApiKey, then restore the returned bearer pair in this client.',
      );
  }

  /** @internal */
  async requestOwnershipChallenge(
    request: OwnershipChallengeRequest,
  ): Promise<OwnershipChallenge> {
    if (this.context.apiKey?.createChallenge !== undefined)
      return this.context.apiKey.createChallenge(request, {
        fetch: this.context.fetch,
      });
    return this.auth.post('/v1/auth/challenge', {
      json: request,
      schema: OwnershipChallengeSchema,
      retry: false,
    });
  }

  /** Opens a bearer session by signing a server-issued ownership challenge.
   * @throws {@link LoginError} Thrown on authentication failure.
   */
  login(request: LoginRequest): Promise<BearerCredentials> {
    return login(this, request);
  }

  /** Migrates saved L2 credentials without a new wallet signature.
   * @throws {@link MigrateCredentialsError} Thrown on migration failure.
   */
  migrateCredentials(
    request: MigrateCredentialsRequest,
  ): Promise<BearerCredentials> {
    return migrateCredentials(this, request);
  }

  /** Constructs a client after its authentication workflow has resolved. @internal */
  createAuthenticatedClient(
    credentials: BearerCredentials,
    account: AccountIdentity | undefined,
    signer: Signer,
    onCredentialsChanged?: CredentialsChanged,
  ): SecureClient<TPublicActions, TSecureActions> {
    const client = new BaseSecureClient({
      onCredentialsChanged,
      account: account,
      apiKey: this.context.apiKey,
      credentials,
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

class BaseSecureClient<
  TPublicActions extends ClientActions = ClientActions,
  TSecureActions extends ClientActions = TPublicActions,
> extends AbstractClient<SecureContext> {
  #hasEndedAuthentication = false;
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
    const l2Credentials =
      'key' in config.credentials ? { ...config.credentials } : undefined;
    const session =
      'accessToken' in config.credentials
        ? new AuthSession({
            credentials: config.credentials,
            onCredentialsChanged: config.onCredentialsChanged,
            refresh: (credentials, signal) =>
              predictions.post('/v1/auth/refresh', {
                json: { refresh_token: credentials.refreshToken },
                schema: TokenResponseSchema,
                signal,
              }),
          })
        : undefined;
    predictions = new AuthenticatedServiceClient({
      fetch: protectRequestErrors(config.fetch),
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
      credentials: l2Credentials,
    });
    super({
      account: config.account,
      l2Credentials,
      session,
      apiKey: config.apiKey,
      environment: config.environment,
      fetch: config.fetch,
      onRateLimitUpdate: config.onRateLimitUpdate,
      signer: config.signer,
      predictions,
      auth,
      credentialManagement: new ServiceClient({
        fetch: config.fetch,
        onRateLimitUpdate: config.onRateLimitUpdate,
        root: config.environment.clob.rest,
        headers: config.environment.clob.headers,
        resolveHeaders: (request) => this.resolveCredentialHeaders(request),
      }),
      clob: new AuthenticatedServiceClient({
        fetch: protectRequestErrors(config.fetch),
        headers: config.environment.clob.headers,
        onRateLimitUpdate: config.onRateLimitUpdate,
        root: config.environment.clob.rest,
        refreshToken: (signal) => this.refreshTokens(signal),
        resolveHeaders: (request) =>
          this.resolveSecureHeaders(request, (request) =>
            this.resolveClobHeaders(request),
          ),
      }),
      relayer: new AuthenticatedServiceClient({
        fetch: protectRequestErrors(config.fetch),
        headers: config.environment.relayer.headers,
        root: config.environment.relayer.rest,
        refreshToken: (signal) => this.refreshTokens(signal),
        resolveHeaders: (request) =>
          this.resolveSecureHeaders(request, (request) =>
            this.resolveRelayerHeaders(request),
          ),
      }),
      rpc: new JsonRpcClient({
        url: config.environment.rpc,
        fetch: config.fetch,
      }),
      gamma: new AuthenticatedServiceClient({
        fetch: protectRequestErrors(config.fetch),
        resolveHeaders: (request) => this.resolveSecureHeaders(request),
        headers: config.environment.gamma.headers,
        root: config.environment.gamma.rest,
        refreshToken: (signal) => this.refreshTokens(signal),
      }),
      data: new AuthenticatedServiceClient({
        fetch: protectRequestErrors(config.fetch),
        resolveHeaders: (request) => this.resolveSecureHeaders(request),
        headers: config.environment.data.headers,
        root: config.environment.data.rest,
        refreshToken: (signal) => this.refreshTokens(signal),
      }),
      rfq: new AuthenticatedServiceClient({
        fetch: protectRequestErrors(config.fetch),
        resolveHeaders: (request) => this.resolveSecureHeaders(request),
        headers: config.environment.combos.headers,
        root: config.environment.combos.rest,
        refreshToken: (signal) => this.refreshTokens(signal),
      }),
      perps: new ServiceClient({
        fetch: config.fetch,
        headers: config.environment.perps.headers,
        root: config.environment.perps.rest,
      }),
      secureClob: new AuthenticatedServiceClient({
        fetch: protectRequestErrors(config.fetch),
        headers: config.environment.clob.headers,
        onRateLimitUpdate: config.onRateLimitUpdate,
        resolveHeaders: async (request) => {
          const headers = new Headers(
            await this.resolveSecureHeaders(request, (request) =>
              this.resolveClobHeaders(request),
            ),
          );
          for (const [key, value] of new Headers(
            await this.#createL2Headers(request),
          ))
            headers.set(key, value);
          return headers;
        },
        root: config.environment.clob.rest,
        refreshToken: (signal) => this.refreshTokens(signal),
      }),
      combos: new AuthenticatedServiceClient({
        fetch: protectRequestErrors(config.fetch),
        headers: config.environment.combos.collateralReturn.headers,
        resolveHeaders: (request) =>
          this.resolveSecureHeaders(request, (request) =>
            this.resolveRelayerHeaders(request),
          ),
        root: config.environment.combos.collateralReturn.rest,
        refreshToken: (signal) => this.refreshTokens(signal),
      }),
      builderGateway: new AuthenticatedServiceClient({
        fetch: protectRequestErrors(config.fetch),
        headers: config.environment.combos.builderGateway.headers,
        resolveHeaders: async (request) => {
          const headers = new Headers(
            await this.resolveSecureHeaders(request, (request) =>
              this.#resolveBuilderGatewayHeaders(request),
            ),
          );
          for (const [key, value] of new Headers(
            await this.#createL2Headers(request),
          ))
            headers.set(key, value);
          return headers;
        },
        root: config.environment.combos.builderGateway.rest,
        refreshToken: (signal) => this.refreshTokens(signal),
      }),
      webSockets: {
        clobMarket: new ClobMarketWebSocketManager({
          headers: config.environment.clob.market.headers,
          url: config.environment.clob.market.ws,
        }),
        clobUser: new ClobUserWebSocketManager({
          session,
          credentials: l2Credentials,
          headers: config.environment.clob.user.headers,
          url: config.environment.clob.user.ws,
        }),
        rfqQuoter: new RfqQuoterWebSocketManager({
          account: config.account,
          chainId: config.environment.chainId,
          session,
          credentials: l2Credentials,
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
    const signing = predictionSigningRequest(request);
    return this.resolveSecureHeaders(request, async () => {
      const headers = new Headers(
        await context.apiKey?.authorize(signing?.request ?? request, {
          fetch: context.fetch,
          signal: request.signal,
        }),
      );
      if (signing?.l2) {
        for (const [key, value] of new Headers(
          await this.#createL2Headers(signing.request),
        ))
          headers.set(key, value);
      }
      return headers;
    });
  }

  protected async resolveSecureHeaders(
    request: ServiceRequest,
    resolveHeaders?: RequestHeadersResolver,
  ): Promise<HeadersInit> {
    const session = (
      request.path.startsWith('/v1/auth/') ? super.context : this.context
    ).session;
    const credentials =
      session === undefined
        ? undefined
        : request.path.startsWith('/v1/auth/')
          ? session.credentials
          : await session.ready(request.signal);
    const headers = new Headers(await resolveHeaders?.(request));
    if (credentials !== undefined) {
      headers.set('Authorization', `Bearer ${credentials.accessToken}`);
      if (request.signal !== undefined)
        this.#requestTokens.set(request.signal, credentials.accessToken);
    }
    return headers;
  }

  protected async refreshTokens(signal?: AbortSignal): Promise<boolean> {
    const session = this.context.session;
    if (session === undefined) return false;
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

  /** @internal Wallet submissions can use a platform-attributed bearer session. */
  get supportsGaslessWallet(): boolean {
    return (
      this.supportsGasless ||
      (this.context.session !== undefined &&
        this.context.apiKey?.authorizeGateway !== undefined)
    );
  }

  /** @internal */
  get session(): AuthSession {
    const session = this.context.session;
    invariant(session !== undefined, 'This client uses L2 authentication.');
    return session;
  }

  /** @internal */
  closeAuthenticationSession(): void {
    this.context.session?.close();
  }

  /**
   * The authenticated account identity associated with this client, including the signer and wallet addresses and wallet type.
   * @throws {@link UserInputError} Thrown when this session has no wallet.
   */
  get account(): AccountIdentity {
    const account = this.context.account;
    if (account === undefined)
      throw new UserInputError(
        'This session has no wallet. Authenticate with a wallet to use account operations.',
      );
    return account;
  }

  /** @internal */
  get signer(): Signer {
    return this.context.signer;
  }

  /** @internal */
  get secureClob(): ServiceClient {
    return this.context.secureClob;
  }

  /** @internal */
  get combos(): ServiceClient {
    return this.context.combos;
  }

  /** @internal */
  get builderGateway(): ServiceClient {
    return this.context.builderGateway;
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
   * This closes the current `SecureClient` and its local consumers. Bearer
   * credentials end their refresh session; issued access tokens remain valid until expiry.
   * Expired bearer credentials are renewed solely for revocation. With L2
   * credentials no request is sent: the key is not revoked and stays valid. Concurrent calls share
   * one logout operation, and local cleanup completes even when revocation fails.
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
    const closingSubscriptions = this.closeSubscriptions();
    const shuttingDownPerpsSessions = this.webSockets.perpsSession.shutdown();
    const shuttingDownRfqQuoter = this.webSockets.rfqQuoter.shutdown();
    const { apiKey, environment, onRateLimitUpdate, fetch, session, auth } =
      this.context;
    this.endAuthenticationLifecycle();

    try {
      if (session !== undefined)
        await session.logout((accessToken) =>
          auth.post('/v1/auth/logout', {
            headers: { Authorization: `Bearer ${accessToken}` },
            responseType: 'empty',
          }),
        );
    } finally {
      this.endAuthenticationLifecycle();
      session?.close();
      await Promise.allSettled([
        closingSubscriptions,
        shuttingDownPerpsSessions,
        shuttingDownRfqQuoter,
      ]).then(() => undefined);
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

  // Builder gateway status reads authenticate with account headers only;
  // builder headers are required on the mutating requests.
  async #resolveBuilderGatewayHeaders(
    request: ServiceRequest,
  ): Promise<HeadersInit> {
    if (request.method !== 'GET' && this.context.apiKey?.isBuilderKey) {
      return this.context.apiKey.authorize(request, {
        fetch: this.context.fetch,
        signal: request.signal,
      });
    }
    return {};
  }
  protected override resolveCredentialHeaders(
    request: ServiceRequest,
  ): Promise<HeadersInit> {
    const { l2Credentials } = this.context;
    const ownerAuthentication =
      request.path === '/auth/api-keys' ||
      (request.path === '/auth/api-key' && request.method === 'DELETE') ||
      (request.path === '/auth/builder-api-key' && request.method !== 'DELETE');
    if (!ownerAuthentication) return super.resolveCredentialHeaders(request);
    if (l2Credentials === undefined)
      throw new UserInputError(
        'This credential operation requires a client authenticated with L2 key/secret/passphrase credentials. Bearer-only credential administration is not supported.',
      );
    return this.#createL2Headers(request);
  }

  async #createL2Headers(request: ServiceRequest): Promise<HeadersInit> {
    const credentials = this.context.l2Credentials;
    if (credentials === undefined) return {};
    try {
      const timestamp = Math.floor(Date.now() / 1000);

      return {
        POLY_ADDRESS: this.account.signer,
        POLY_API_KEY: credentials.key,
        POLY_PASSPHRASE: credentials.passphrase,
        POLY_SIGNATURE: await buildHmacSignature(
          credentials.secret,
          timestamp,
          request.method,
          request.path,
          request.body,
        ),
        POLY_TIMESTAMP: `${timestamp}`,
      };
    } catch (error) {
      throw SigningError.fromError(
        error,
        'Could not sign the L2-authenticated request',
      );
    }
  }
}

type SecureContext = PublicContext & {
  predictions: AuthenticatedServiceClient;
  /** @internal */
  account: AccountIdentity | undefined;
  /** @internal */
  session?: AuthSession;
  l2Credentials?: ApiKeyCreds;
  /** @internal */
  signer: Signer;
  /** @internal */
  secureClob: ServiceClient;
  /** @internal */
  combos: ServiceClient;
  /** @internal */
  builderGateway: ServiceClient;
  /** @internal */
  webSockets: SecureWebSocketManagers;
};

type SecureClientConfig = PublicClientConfig & {
  account: AccountIdentity | undefined;
  credentials: ClientCredentials;
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
   * Optional request authorization applied by the client when needed.
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
   * For fresh login or L2 migration, omission selects the signer's deterministic
   * Deposit Wallet. Restored bearer credentials use the token's wallet claim;
   * signer-only tokens skip wallet discovery and setup.
   * Pass the signer address itself to explicitly trade as
   * an EOA account, or pass a supported Poly Deposit Wallet, Poly Safe, or Poly
   * Proxy wallet address to use that wallet as the account/funder.
   */
  wallet?: string;

  /**
   * Wallet-library adapter used to authenticate and complete wallet operations.
   */
  signer: Signer;
  /** Bot-protection verification token for browser sign-in, when one is required. */
  verificationToken?: string;
  /** Called after adoption of a refreshed token pair. Sync/async failures are ignored; handle persistence failures inside the callback. */
  onCredentialsChanged?: CredentialsChanged;
} & (
    | {
        /**
         * Saved bearer tokens or L2 credentials from an earlier SDK version.
         * L2 credentials are exchanged for bearer tokens without a new wallet
         * signature. A failed migration or rejected bearer session rejects
         * creation without falling back to signing.
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
 * failures reject client creation. Restored signer-only bearer sessions skip
 * wallet discovery and setup.
 *
 * @example
 * ```ts
 * const secureClient = await createSecureClient({
 *   signer,
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
  let wallet: EvmAddress | undefined;
  const restored =
    params.credentials !== undefined && 'accessToken' in params.credentials;
  if (params.credentials !== undefined && 'accessToken' in params.credentials) {
    credentials = params.credentials;
    const claims = accessTokenClaims(credentials.accessToken);
    wallet = claims.wallet;
    if (
      params.wallet !== undefined &&
      (wallet === undefined || !isSameEvmAddress(params.wallet, wallet))
    )
      throw new RequestRejectedError(
        'Session identity does not match the requested wallet.',
        { status: 401 },
      );
  } else {
    wallet = await resolveRequestedWallet(client, options, signerAddress);
    // Validate supported wallet identity before authentication has any side effects.
    resolveAccountIdentity(
      client.environment,
      signerAddress,
      expectEvmAddress(wallet),
    );
    credentials =
      params.credentials !== undefined && 'key' in params.credentials
        ? await client.migrateCredentials({
            credentials: params.credentials,
            signer: signerAddress,
            wallet,
            verificationToken: params.verificationToken,
          })
        : await client.login({
            signer: options.signer,
            wallet,
            nonce: params.nonce,
            verificationToken: params.verificationToken,
          });
  }
  const claims = accessTokenClaims(credentials.accessToken);
  if (
    !isSameEvmAddress(claims.sub, signerAddress) ||
    (wallet !== undefined &&
      (claims.wallet === undefined || !isSameEvmAddress(claims.wallet, wallet)))
  )
    throw new RequestRejectedError(
      'Session identity does not match the requested signer and wallet.',
      { status: 401 },
    );
  const account =
    wallet === undefined
      ? undefined
      : resolveAccountIdentity(
          client.environment,
          signerAddress,
          expectEvmAddress(wallet),
        );
  const secureClient = client.createAuthenticatedClient(
    credentials,
    account,
    options.signer,
    params.onCredentialsChanged,
  );

  try {
    if (restored) await secureClient.session.refresh();
    else await secureClient.session.ready();
    secureClient.session.start();
    if (account === undefined) return secureClient;
    if (secureClient.account.walletType === WalletType.EOA) {
      return secureClient;
    }

    const deployed = await isWalletDeployed(secureClient, {
      wallet: secureClient.account.wallet,
      type: secureClient.account.walletType,
    });

    if (deployed) {
      return secureClient;
    }

    if (secureClient.account.walletType === WalletType.DEPOSIT_WALLET) {
      await deployDefaultDepositWallet(secureClient);
      return secureClient;
    }

    throw new UserInputError(
      `Wallet ${secureClient.account.wallet} does not exist. Provide an existing wallet address, or omit wallet to use the default Deposit Wallet flow.`,
    );
  } catch (error) {
    secureClient.closeAuthenticationSession();
    await secureClient.closeSubscriptions();
    throw error;
  }
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
