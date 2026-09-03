import {
  PriceHistoryInterval,
  type PriceHistoryPoint,
} from '@polymarket/bindings/data';
import type { Market } from '@polymarket/bindings/gamma';
import { describe, expectTypeOf, it } from 'vitest';
import type { DataActions } from '../decorators';
import type { Paginated } from '../pagination';
import type { ListPriceHistoryRequest, listPriceHistory } from './markets';

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
