import { ApiKeySchema, EvmAddressSchema } from '@polymarket/bindings';
import type { ApiKeyCreds } from '@polymarket/bindings/clob';
import { WalletType } from '@polymarket/bindings/gamma';
import {
  expectEvmAddress,
  expectEvmSignature,
  invariant,
  isSameEvmAddress,
  type Prettify,
} from '@polymarket/types';
import { z } from 'zod';
import {
  createOrDeriveApiKey,
  deleteApiKey,
  fetchApiKeys,
} from './actions/auth';
import {
  type DeployDepositWalletError,
  deployDepositWallet,
  type IsWalletDeployedError,
  isWalletDeployed,
  type WaitForGaslessTransactionError,
} from './actions/gasless';
import { createApiKeyAuthTypedDataPayload } from './authentication';
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
import { JsonRpcClient } from './rpc';
import type { ServiceRequest } from './ServiceClient';
import { ServiceClient } from './ServiceClient';
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
  RfqQuoterWebSocketManager,
  RtdsWebSocketManager,
  type SecureWebSocketManagers,
  SportsWebSocketManager,
} from './websockets';
import {
  type AuthenticationWorkflow,
  authenticateWith,
  requestAddress,
} from './workflow';

type PublicContext = {
  /** @internal */
  apiKey?: ApiKeyAuthorization;
  /** @internal */
  environment: EnvironmentConfig;
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

  /** @internal */
  get webSockets(): PublicWebSocketManagers {
    return this.context.webSockets;
  }

  /** @internal */
  get supportsGasless(): boolean {
    return this.context.apiKey?.supportGasless ?? false;
  }

  constructor(context: TContext) {
    this.#context = context;
    this.#decorators = [];
  }

  protected async resolveClobHeaders(
    request: ServiceRequest,
  ): Promise<HeadersInit> {
    if (this.context.apiKey?.isBuilderKey) {
      return this.context.apiKey.authorize(request);
    }
    return Promise.resolve({});
  }

  protected async resolveRelayerHeaders(
    request: ServiceRequest,
  ): Promise<HeadersInit> {
    if (this.context.apiKey?.supportGasless) {
      return this.context.apiKey.authorize(request);
    }
    return Promise.resolve({});
  }

  protected rememberDecorator(decorator: ClientDecorator): void {
    this.#decorators.push(decorator);
  }
}

const BeginAuthenticationCredentialsSchema = z.object({
  key: ApiKeySchema,
  passphrase: z.string(),
  secret: z.string(),
});

export type BeginAuthenticationRequest = {
  /**
   * Wallet address to authenticate as.
   *
   * Pass the signer address itself to authenticate as an EOA account.
   */
  wallet: string;

  /**
   * Nonce used when creating or deriving fresh credentials.
   *
   * Mutually exclusive with `credentials`.
   *
   * @defaultValue 0
   */
  nonce?: number;

  /**
   * Existing API credentials to reuse when they remain valid.
   *
   * If these credentials are revoked or invalid, authentication falls back to
   * fresh authentication and the signer may be asked to sign again.
   */
  credentials?: ApiKeyCreds;
};

const BeginAuthenticationRequestSchema: z.ZodType<BeginAuthenticationRequest> =
  z
    .object({
      wallet: EvmAddressSchema,
      credentials: BeginAuthenticationCredentialsSchema.optional(),
      nonce: z.number().int().nonnegative().optional(),
    })
    .superRefine((value, context) => {
      if (value.credentials !== undefined && value.nonce !== undefined) {
        context.addIssue({
          code: 'custom',
          message: '`credentials` and `nonce` are mutually exclusive.',
          path: ['nonce'],
        });
      }
    })
    .transform((value): BeginAuthenticationRequest => {
      if (value.credentials !== undefined) {
        return {
          wallet: value.wallet,
          credentials: value.credentials,
        };
      }

      if (value.nonce !== undefined) {
        return {
          wallet: value.wallet,
          nonce: value.nonce,
        };
      }

      return {
        wallet: value.wallet,
      };
    });

type PublicClientConfig = {
  environment: EnvironmentConfig;
  apiKey?: ApiKeyAuthorization;
};

class BasePublicClient<
  TPublicActions extends ClientActions = ClientActions,
  TSecureActions extends ClientActions = TPublicActions,
> extends AbstractClient<PublicContext> {
  constructor(config: PublicClientConfig) {
    super({
      apiKey: config.apiKey,
      environment: config.environment,
      data: new ServiceClient({
        headers: config.environment.data.headers,
        root: config.environment.data.rest,
      }),
      gamma: new ServiceClient({
        headers: config.environment.gamma.headers,
        root: config.environment.gamma.rest,
      }),
      clob: new ServiceClient({
        headers: config.environment.clob.headers,
        root: config.environment.clob.rest,
        resolveHeaders: (request) => this.resolveClobHeaders(request),
      }),
      relayer: new ServiceClient({
        headers: config.environment.relayer.headers,
        root: config.environment.relayer.rest,
        resolveHeaders: (request) => this.resolveRelayerHeaders(request),
      }),
      rfq: new ServiceClient({
        headers: config.environment.combos.headers,
        root: config.environment.combos.rest,
      }),
      perps: new ServiceClient({
        headers: config.environment.perps.headers,
        root: config.environment.perps.rest,
      }),
      rpc: new JsonRpcClient({ url: config.environment.rpc }),
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

  /**
   * Begins an authentication workflow that produces a {@link SecureClient}.
   *
   * @remarks
   * This is a low-level method for building wallet-interactive workflows. Most
   * applications should use {@link createSecureClient} instead.
   *
   * @internal
   */
  beginAuthentication(
    request: BeginAuthenticationRequest,
    signer: Signer,
  ): Promise<
    AuthenticationWorkflow<SecureClient<TPublicActions, TSecureActions>>
  > {
    const params = parseUserInput(request, BeginAuthenticationRequestSchema);

    return Promise.resolve(
      async function* (
        this: PublicClient<TPublicActions, TSecureActions>,
      ): AuthenticationWorkflow<SecureClient<TPublicActions, TSecureActions>> {
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = params?.nonce ?? 0;
        const signerAddress = expectEvmAddress(yield requestAddress());
        const wallet = expectEvmAddress(params.wallet);
        const identity = resolveAccountIdentity(
          this.environment,
          signerAddress,
          wallet,
        );

        if (params.credentials !== undefined) {
          const client = this.#createSecureClient(
            params.credentials,
            identity,
            signer,
          );

          try {
            const apiKeys = await fetchApiKeys(client);
            if (apiKeys.includes(params.credentials.key)) {
              return client;
            }
          } catch (error) {
            if (
              !(error instanceof RequestRejectedError) ||
              error.status !== 401
            ) {
              throw error;
            }
          }
        }

        const signature = yield {
          kind: 'signAuthMessage',
          payload: createApiKeyAuthTypedDataPayload({
            address: signerAddress,
            chainId: this.environment.chainId,
            nonce,
            timestamp,
          }),
        };
        const credentials = await createOrDeriveApiKey(this, {
          address: signerAddress,
          nonce,
          signature: expectEvmSignature(signature),
          timestamp,
        });

        return this.#createSecureClient(credentials, identity, signer);
      }.call(this as unknown as PublicClient<TPublicActions, TSecureActions>),
    );
  }

  #createSecureClient(
    credentials: ApiKeyCreds,
    account: AccountIdentity,
    signer: Signer,
  ): SecureClient<TPublicActions, TSecureActions> {
    const client = new BaseSecureClient({
      account: account,
      apiKey: this.context.apiKey,
      credentials,
      environment: this.environment,
      signer,
    });

    for (const decorator of this.decorators) {
      client.extend(decorator);
    }

    return client as SecureClient<TPublicActions, TSecureActions>;
  }
}

class BaseSecureClient<
  TPublicActions extends ClientActions = ClientActions,
  TSecureActions extends ClientActions = TPublicActions,
> extends AbstractClient<SecureContext> {
  #hasEndedAuthentication = false;

  /**
   * @remarks This is the choking point for all requests, so we can ensure that once
   * `endAuthentication` is called, no further authenticated requests can be made with this client instance.
   */
  protected override get context(): SecureContext {
    invariant(
      !this.#hasEndedAuthentication,
      'This client has ended authentication and can no longer be used.',
    );

    return super.context;
  }

  protected endAuthenticationLifecycle(): void {
    this.#hasEndedAuthentication = true;
  }

  constructor(config: SecureClientConfig) {
    super({
      account: config.account,
      credentials: config.credentials,
      apiKey: config.apiKey,
      environment: config.environment,
      signer: config.signer,
      clob: new ServiceClient({
        headers: config.environment.clob.headers,
        root: config.environment.clob.rest,
        resolveHeaders: (request) => this.resolveClobHeaders(request),
      }),
      relayer: new ServiceClient({
        headers: config.environment.relayer.headers,
        root: config.environment.relayer.rest,
        resolveHeaders: (request) => this.resolveRelayerHeaders(request),
      }),
      rpc: new JsonRpcClient({ url: config.environment.rpc }),
      gamma: new ServiceClient({
        headers: config.environment.gamma.headers,
        root: config.environment.gamma.rest,
      }),
      data: new ServiceClient({
        headers: config.environment.data.headers,
        root: config.environment.data.rest,
      }),
      rfq: new ServiceClient({
        headers: config.environment.combos.headers,
        root: config.environment.combos.rest,
      }),
      perps: new ServiceClient({
        headers: config.environment.perps.headers,
        root: config.environment.perps.rest,
      }),
      secureClob: new ServiceClient({
        headers: config.environment.clob.headers,
        resolveHeaders: async (request) => ({
          ...(await this.resolveClobHeaders(request)),
          ...(await this.#createL2Headers(request)),
        }),
        root: config.environment.clob.rest,
      }),
      combos: new ServiceClient({
        headers: config.environment.combos.collateralReturn.headers,
        resolveHeaders: (request) => this.resolveRelayerHeaders(request),
        root: config.environment.combos.collateralReturn.rest,
      }),
      webSockets: {
        clobMarket: new ClobMarketWebSocketManager({
          headers: config.environment.clob.market.headers,
          url: config.environment.clob.market.ws,
        }),
        clobUser: new ClobUserWebSocketManager({
          credentials: config.credentials,
          headers: config.environment.clob.user.headers,
          url: config.environment.clob.user.ws,
        }),
        rfqQuoter: new RfqQuoterWebSocketManager({
          account: config.account,
          chainId: config.environment.chainId,
          credentials: config.credentials,
          exchange: config.environment.contracts.exchangeV3,
          headers: config.environment.combos.headers,
          signer: config.signer,
          url: config.environment.combos.ws,
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
        perpsSession: new PerpsSessionManager({
          chainId: config.environment.chainId,
          headers: config.environment.perps.headers,
          restUrl: config.environment.perps.rest,
          wsUrl: config.environment.perps.ws,
        }),
      },
    });
  }

  /**
   * API credentials for the authenticated session.
   *
   * @remarks
   * These credentials are sensitive. Store them securely if you want to create
   * another secure client later without requiring a new authentication signature
   * while the credentials remain valid.
   */
  get credentials(): ApiKeyCreds {
    return this.context.credentials;
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

  /** @internal */
  get secureClob(): ServiceClient {
    return this.context.secureClob;
  }

  /** @internal */
  get combos(): ServiceClient {
    return this.context.combos;
  }

  /** @internal */
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
   * This revokes the current authenticated credential and invalidates the
   * current `SecureClient` instance.
   *
   * @example
   * ```ts
   * const publicClient = await secureClient.endAuthentication();
   * ```
   */
  async endAuthentication(): Promise<
    PublicClient<TPublicActions, TSecureActions>
  > {
    // Server-side revocation must not depend on local WebSocket cleanup.
    const closingSubscriptions = this.closeSubscriptions();
    const shuttingDownPerpsSessions = this.webSockets.perpsSession.shutdown();
    const shuttingDownRfqQuoter = this.webSockets.rfqQuoter.shutdown();
    const { apiKey, environment } = this.context;

    try {
      await deleteApiKey(this);
    } finally {
      this.endAuthenticationLifecycle();
      await Promise.allSettled([
        closingSubscriptions,
        shuttingDownPerpsSessions,
        shuttingDownRfqQuoter,
      ]).then(() => undefined);
    }

    const client = new BasePublicClient({
      apiKey,
      environment,
    });

    for (const decorator of this.decorators) {
      client.extend(decorator);
    }

    return client as PublicClient<TPublicActions, TSecureActions>;
  }

  async #createL2Headers(request: ServiceRequest): Promise<HeadersInit> {
    try {
      const timestamp = Math.floor(Date.now() / 1000);

      return {
        POLY_ADDRESS: this.account.signer,
        POLY_API_KEY: this.credentials.key,
        POLY_PASSPHRASE: this.credentials.passphrase,
        POLY_SIGNATURE: await buildHmacSignature(
          this.credentials.secret,
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
  /** @internal */
  account: AccountIdentity;
  /** @internal */
  credentials: ApiKeyCreds;
  /** @internal */
  signer: Signer;
  /** @internal */
  secureClob: ServiceClient;
  /** @internal */
  combos: ServiceClient;
  /** @internal */
  webSockets: SecureWebSocketManagers;
};

type SecureClientConfig = PublicClientConfig & {
  account: AccountIdentity;
  credentials: ApiKeyCreds;
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
   * The environment configuration used by the client.
   *
   * @defaultValue `production`
   */
  environment?: EnvironmentConfig;

  /**
   * Optional request authorization applied by the client when needed.
   */
  apiKey?: ApiKeyAuthorization;
};

export type SecureClientOptions = PublicClientOptions & {
  /**
   * Wallet address to use as the account wallet.
   *
   * If omitted, the client uses the signer's deterministic Deposit Wallet as
   * the account wallet. Pass the signer address itself to explicitly trade as
   * an EOA account, or pass a supported Poly Deposit Wallet, Poly Safe, or Poly
   * Proxy wallet address to use that wallet as the account/funder.
   */
  wallet?: string;

  /**
   * Wallet-library adapter used to authenticate and complete wallet operations.
   */
  signer: Signer;
} & (
    | {
        /**
         * Existing API credentials to reuse when they remain valid.
         */
        credentials?: ApiKeyCreds;
        nonce?: never;
      }
    | {
        credentials?: never;
        /**
         * Nonce used when creating or deriving fresh credentials.
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
  }).extend(allActions);
}

export type CreateSecureClientError =
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
  });
  const wallet = await resolveRequestedWallet(client, options);

  const secureClient = await client
    .beginAuthentication(
      {
        wallet,
        credentials: options.credentials,
        nonce: options.nonce,
      },
      options.signer,
    )
    .then(authenticateWith(options.signer));

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
}

/** Resolves the wallet address to authenticate as. */
async function resolveRequestedWallet(
  client: BasePublicClient,
  options: SecureClientOptions,
): Promise<string> {
  if (options.wallet !== undefined) {
    return options.wallet;
  }

  const signerAddress = expectEvmAddress(await options.signer.getAddress());
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
