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

export type EnvironmentConfig = {
  name: string;
  chainId: number;
  /** @internal */
  rpc: string;
  /** @internal */
  walletDerivation: WalletDerivationConfig;
  /** @internal */
  collateralToken: EvmAddress;
  /** @internal */
  conditionalTokens: EvmAddress;
  /** @internal */
  negRiskAdapter: EvmAddress;
  /** @internal */
  collateralAdapter: EvmAddress;
  /** @internal */
  negRiskCollateralAdapter: EvmAddress;
  /** @internal */
  standardExchange: EvmAddress;
  /** @internal */
  negRiskExchange: EvmAddress;
  /** @internal */
  autoRedeemOperator: EvmAddress;
  /** @internal */
  safeMultisend: EvmAddress;
  /** @internal */
  relayHub: EvmAddress;
  /** @internal */
  clob: string;
  /** @internal */
  clobMarketWs: string;
  /** @internal */
  clobUserWs: string;
  /** @internal */
  relayer: string;
  /** @internal */
  gamma: string;
  /** @internal */
  data: string;
  /** @internal */
  rtdsWs: string;
  /** @internal */
  sportsWs: string;
  /** @internal */
  relayerMaxPolls: number;
  /** @internal */
  relayerPollFrequencyMs: number;
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
  autoRedeemOperator: expectEvmAddress(
    '0xF3cFb6a6eBFeB51876289Eb235719EB1C65252B0',
  ),
  safeMultisend: expectEvmAddress('0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761'),
  relayHub: expectEvmAddress('0xD216153c06E857cD7f72665E0aF1d7D82172F494'),
  clob: 'https://clob.polymarket.com',
  clobMarketWs: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
  clobUserWs: 'wss://ws-subscriptions-clob.polymarket.com/ws/user',
  relayer: 'https://relayer-v2.polymarket.com',
  gamma: 'https://gamma-api.polymarket.com',
  data: 'https://data-api.polymarket.com',
  rtdsWs: 'wss://ws-live-data.polymarket.com',
  sportsWs: 'wss://sports-api.polymarket.com/ws',
  relayerMaxPolls: 100,
  relayerPollFrequencyMs: 2000,
};
