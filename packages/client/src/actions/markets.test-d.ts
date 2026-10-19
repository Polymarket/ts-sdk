import {
  type MetaHolder,
  PriceHistoryInterval,
  type PriceHistoryPoint,
} from '@polymarket/bindings/data';
import type { Market } from '@polymarket/bindings/gamma';
import { describe, expectTypeOf, it } from 'vitest';
import type { DataActions, DiscoveryActions } from '../decorators';
import {
  MarketResolutionStatus,
  ProtocolVersion,
  type PublicClient,
  type ResolutionRequestId,
} from '../index';
import type { Paginated } from '../pagination';
import type {
  ListMarketsRequest,
  ListPriceHistoryRequest,
  listMarketHolders,
  listPriceHistory,
} from './markets';
import { listMarkets } from './markets';

describe('price history request types', () => {
  it('accepts exactly one time selection', () => {
    const intervalRequest = {
      assetId: '123',
      interval: PriceHistoryInterval.OneDay,
    } satisfies ListPriceHistoryRequest;
    const rangeRequest = {
      assetId: '123',
      start: new Date(),
      end: new Date(),
    } satisfies ListPriceHistoryRequest;
    const asOfRequest = {
      assetId: '123',
      asOf: 1_700_000_000,
    } satisfies ListPriceHistoryRequest;

    // @ts-expect-error Interval and explicit ranges are mutually exclusive.
    const conflictingRequest: ListPriceHistoryRequest = {
      assetId: '123',
      interval: PriceHistoryInterval.OneDay,
      start: 1_700_000_000,
    };
    // @ts-expect-error A time selection is required.
    const missingWindowRequest: ListPriceHistoryRequest = {
      assetId: '123',
    };

    void intervalRequest;
    void rangeRequest;
    void asOfRequest;
    void conflictingRequest;
    void missingWindowRequest;
  });

  it('exposes the same paginated model on actions and decorators', () => {
    expectTypeOf<ReturnType<typeof listPriceHistory>>().toEqualTypeOf<
      Paginated<PriceHistoryPoint[]>
    >();
  });
});

describe('market holders request types', () => {
  it('returns normalized pagination', () => {
    expectTypeOf<ReturnType<typeof listMarketHolders>>().toEqualTypeOf<
      Paginated<MetaHolder[]>
    >();
  });
});

function listMarketPriceHistory(actions: DataActions, market: Market) {
  const assetId = market.outcomes.yes.tokenId;

  if (assetId === null) return;

  expectTypeOf(
    actions.listPriceHistory({
      assetId,
      interval: PriceHistoryInterval.OneDay,
    }),
  ).toEqualTypeOf<Paginated<PriceHistoryPoint[]>>();
}

void listMarketPriceHistory;

function listMarketHoldersForMarket(actions: DataActions, market: Market) {
  if (market.conditionId === null) return;

  expectTypeOf(
    actions.listMarketHolders({
      conditionIds: [market.conditionId],
    }),
  ).toEqualTypeOf<Paginated<MetaHolder[]>>();
}

void listMarketHoldersForMarket;

function listAcrossClosedStates(actions: DiscoveryActions) {
  expectTypeOf(actions.listMarkets({ closed: 'any', ids: [1] })).toEqualTypeOf<
    Paginated<Market[]>
  >();
  actions.listEvents({ closed: 'any' });
  // @ts-expect-error Other boolean filters do not accept the closed sentinel.
  actions.listMarkets({ closed: 'any', ids: [1], cyom: 'any' });
}

void listAcrossClosedStates;

function listMarketsByOracleMetadata(client: PublicClient, market: Market) {
  expectTypeOf(
    client.listMarkets({
      requestIds: ['request-1', 'request-2'],
      onchainEventIds: ['event-1'],
      resolutionStatus: MarketResolutionStatus.Active,
      version: ProtocolVersion.V2,
    }),
  ).toEqualTypeOf<Paginated<Market[]>>();
  expectTypeOf(market.resolution.onchainEventId).toEqualTypeOf<
    string | null | undefined
  >();
  expectTypeOf(market.resolution.requestId).toEqualTypeOf<
    ResolutionRequestId | null | undefined
  >();
  expectTypeOf(market.resolution.resolutionStatus).toEqualTypeOf<
    MarketResolutionStatus | null | undefined
  >();
}

void listMarketsByOracleMetadata;

function listMarketsByMultipleProtocols(client: PublicClient) {
  for (const version of [
    ProtocolVersion.V2,
    [ProtocolVersion.V1, ProtocolVersion.V2],
  ]) {
    const request = { version } satisfies ListMarketsRequest;
    expectTypeOf(client.listMarkets(request)).toEqualTypeOf<
      Paginated<Market[]>
    >();
    expectTypeOf(listMarkets(client, request)).toEqualTypeOf<
      Paginated<Market[]>
    >();
  }
  // @ts-expect-error Numeric protocol aliases are unsupported.
  client.listMarkets({ version: 1 });
  // @ts-expect-error Unknown protocol versions are unsupported.
  client.listMarkets({ version: [ProtocolVersion.V1, 'v3'] });
}

void listMarketsByMultipleProtocols;
