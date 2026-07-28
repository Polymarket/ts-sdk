import { type EvmAddress, expectEvmAddress } from '@polymarket/types';
import type { Hex } from 'ox';

export type WalletDerivationConfig = {
  depositWalletFactory: EvmAddress;
  depositWalletBeacon: EvmAddress;
  depositWalletImplementation: EvmAddress;
  proxyFactory: EvmAddress;
  proxyImplementation: EvmAddress;
  safeFactory: EvmAddress;
  safeInitCodeHash: Hex.Hex;
};

export type RestEndpoint = {
  rest: string;
  headers?: Record<string, string>;
};

export type WebSocketEndpoint = {
  ws: string;
  headers?: Record<string, string>;
};

export type ClobEndpoints = RestEndpoint & {
  market: WebSocketEndpoint;
  user: WebSocketEndpoint;
};

export type CombosEndpoints = RestEndpoint &
  WebSocketEndpoint & {
    collateralReturn: RestEndpoint;
  };

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsEndpoints = RestEndpoint & WebSocketEndpoint;

export type EnvironmentContracts = {
  collateralToken: EvmAddress;
  conditionalTokens: EvmAddress;
  negRiskAdapter: EvmAddress;
  collateralAdapter: EvmAddress;
  negRiskCollateralAdapter: EvmAddress;
  standardExchange: EvmAddress;
  negRiskExchange: EvmAddress;
  exchangeV3: EvmAddress;
  protocolV2Router: EvmAddress;
  combinatorialModule: EvmAddress;
  positionManager: EvmAddress;
  autoRedeemOperator: EvmAddress;
  safeMultisend: EvmAddress;
  relayHub: EvmAddress;
  perpsDepositContract: EvmAddress;
};

export type EnvironmentConfig = {
  name: string;
  chainId: number;
  /** @internal */
  rpc: string;
  /** @internal */
  walletDerivation: WalletDerivationConfig;
  /** @internal */
  contracts: EnvironmentContracts;
  /** @internal */
  clob: ClobEndpoints;
  /** @internal */
  relayer: RestEndpoint;
  /** @internal */
  gamma: RestEndpoint;
  /** @internal */
  data: RestEndpoint;
  /** @internal */
  combos: CombosEndpoints;
  /** @internal */
  perps: PerpsEndpoints;
  /** @internal */
  rtds: WebSocketEndpoint;
  /** @internal */
  sports: WebSocketEndpoint;
  /** @internal */
  relayerMaxPolls: number;
  /** @internal */
  relayerPollFrequencyMs: number;
};

type EnvironmentConfigForkEndpoint = Partial<RestEndpoint & WebSocketEndpoint>;

export type EnvironmentConfigFork = {
  name: string;
  chainId?: number;
  rpc?: string;
  walletDerivation?: Partial<WalletDerivationConfig>;
  contracts?: Partial<EnvironmentContracts>;
  clob?: Partial<RestEndpoint> & {
    market?: Partial<WebSocketEndpoint>;
    user?: Partial<WebSocketEndpoint>;
  };
  relayer?: Partial<RestEndpoint>;
  gamma?: Partial<RestEndpoint>;
  data?: Partial<RestEndpoint>;
  combos?: EnvironmentConfigForkEndpoint & {
    collateralReturn?: Partial<RestEndpoint>;
  };
  perps?: EnvironmentConfigForkEndpoint;
  rtds?: Partial<WebSocketEndpoint>;
  sports?: Partial<WebSocketEndpoint>;
  relayerMaxPolls?: number;
  relayerPollFrequencyMs?: number;
};

/**
 * The production environment configuration.
 */
export const production: EnvironmentConfig = {
  name: 'production',
  chainId: 137,
  rpc: 'https://polygon.drpc.org',
  walletDerivation: {
    depositWalletFactory: expectEvmAddress(
      '0x00000000000Fb5C9ADea0298D729A0CB3823Cc07',
    ),
    depositWalletBeacon: expectEvmAddress(
      '0x7A18EDfe055488A3128f01F563e5B479D92ffc3a',
    ),
    depositWalletImplementation: expectEvmAddress(
      '0x58CA52ebe0DadfdF531Cde7062e76746de4Db1eB',
    ),
    proxyFactory: expectEvmAddress(
      '0xaB45c5A4B0c941a2F231C04C3f49182e1A254052',
    ),
    proxyImplementation: expectEvmAddress(
      '0x44e999d5c2F66Ef0861317f9A4805AC2e90aEB4f',
    ),
    safeFactory: expectEvmAddress('0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b'),
    safeInitCodeHash:
      '0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf',
  },
  contracts: {
    collateralToken: expectEvmAddress(
      '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB',
    ),
    conditionalTokens: expectEvmAddress(
      '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
    ),
    negRiskAdapter: expectEvmAddress(
      '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
    ),
    collateralAdapter: expectEvmAddress(
      '0xAdA100Db00Ca00073811820692005400218FcE1f',
    ),
    negRiskCollateralAdapter: expectEvmAddress(
      '0xadA2005600Dec949baf300f4C6120000bDB6eAab',
    ),
    standardExchange: expectEvmAddress(
      '0xE111180000d2663C0091e4f400237545B87B996B',
    ),
    negRiskExchange: expectEvmAddress(
      '0xe2222d279d744050d28e00520010520000310F59',
    ),
    exchangeV3: expectEvmAddress('0xe3333700cA9d93003F00f0F71f8515005F6c00Aa'),
    protocolV2Router: expectEvmAddress(
      '0x12121212006e4CD160D18e3f00711DA5c3372600',
    ),
    combinatorialModule: expectEvmAddress(
      '0x30000034706c7d8e12009dab006be20000c031a8',
    ),
    positionManager: expectEvmAddress(
      '0x006F54F7f9A22e0000CC2AB60031000000ae9fEF',
    ),
    autoRedeemOperator: expectEvmAddress(
      '0xa1200000d0002264C9a1698e001292D00E1b00af',
    ),
    safeMultisend: expectEvmAddress(
      '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761',
    ),
    relayHub: expectEvmAddress('0xD216153c06E857cD7f72665E0aF1d7D82172F494'),
    perpsDepositContract: expectEvmAddress(
      '0xDCa4af75705dbB50f62437045afF9921947917d2',
    ),
  },
  clob: {
    rest: 'https://clob.polymarket.com',
    market: { ws: 'wss://ws-subscriptions-clob.polymarket.com/ws/market' },
    user: { ws: 'wss://ws-subscriptions-clob.polymarket.com/ws/user' },
  },
  relayer: { rest: 'https://relayer-v2.polymarket.com' },
  gamma: { rest: 'https://gamma-api.polymarket.com' },
  data: { rest: 'https://data-api.polymarket.com' },
  combos: {
    rest: 'https://combos-rfq-api.polymarket.com',
    ws: 'wss://combos-rfq-gateway-quoter.polymarket.com/ws/rfq',
    collateralReturn: {
      rest: 'https://combos-rfq-collateral-return.polymarket.com',
    },
  },
  perps: {
    rest: 'https://api.perpetuals.polymarket.com',
    ws: 'wss://ws.perpetuals.polymarket.com/v1/ws',
  },
  rtds: { ws: 'wss://ws-live-data.polymarket.com' },
  sports: { ws: 'wss://sports-api.polymarket.com/ws' },
  relayerMaxPolls: 100,
  relayerPollFrequencyMs: 2000,
};

/**
 * Forks an environment config from production unless a different base is passed.
 *
 * @experimental This helper is intended for advanced custom environment use,
 * not general SDK usage. Its signature may change without notice.
 */
export function forkEnvironmentConfig(
  fork: EnvironmentConfigFork,
  base: EnvironmentConfig = production,
): EnvironmentConfig {
  return {
    ...base,
    ...fork,
    walletDerivation: {
      ...base.walletDerivation,
      ...fork.walletDerivation,
    },
    contracts: {
      ...base.contracts,
      ...fork.contracts,
    },
    clob: {
      ...forkRestEndpoint(base.clob, fork.clob),
      market: forkWebSocketEndpoint(base.clob.market, fork.clob?.market),
      user: forkWebSocketEndpoint(base.clob.user, fork.clob?.user),
    },
    relayer: forkRestEndpoint(base.relayer, fork.relayer),
    gamma: forkRestEndpoint(base.gamma, fork.gamma),
    data: forkRestEndpoint(base.data, fork.data),
    combos: {
      ...forkRestWebSocketEndpoint(base.combos, fork.combos),
      collateralReturn: forkRestEndpoint(
        base.combos.collateralReturn,
        fork.combos?.collateralReturn,
      ),
    },
    perps: forkRestWebSocketEndpoint(base.perps, fork.perps),
    rtds: forkWebSocketEndpoint(base.rtds, fork.rtds),
    sports: forkWebSocketEndpoint(base.sports, fork.sports),
  };
}

function forkRestEndpoint(
  base: RestEndpoint,
  fork: Partial<RestEndpoint> | undefined,
): RestEndpoint {
  return {
    ...base,
    ...fork,
    headers: forkHeaders(base.headers, fork?.headers),
  };
}

function forkWebSocketEndpoint(
  base: WebSocketEndpoint,
  fork: Partial<WebSocketEndpoint> | undefined,
): WebSocketEndpoint {
  return {
    ...base,
    ...fork,
    headers: forkHeaders(base.headers, fork?.headers),
  };
}

function forkRestWebSocketEndpoint<
  TEndpoint extends RestEndpoint & WebSocketEndpoint,
>(base: TEndpoint, fork: EnvironmentConfigForkEndpoint | undefined): TEndpoint {
  return {
    ...base,
    ...fork,
    headers: forkHeaders(base.headers, fork?.headers),
  };
}

function forkHeaders(
  base: Record<string, string> | undefined,
  fork: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (base === undefined && fork === undefined) return undefined;
  return { ...base, ...fork };
}

/** @internal */
export const preproduction = forkEnvironmentConfig({
  name: 'preproduction',
  clob: { rest: 'https://clob-preprod-int-v2.polymarket.com' },
  data: { rest: 'https://data-api-preprod-int.polymarket.com' },
  gamma: { rest: 'https://gamma-api-preprod-int.polymarket.com' },
  relayer: { rest: 'https://relayer-v2-preprod-int.polymarket.com' },
});
