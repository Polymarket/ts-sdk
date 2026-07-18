import type { Event, Market, OrderBook } from '@polymarket/client';
import type {
  FetchMarketError,
  FetchOrderBookError,
  ListEventsError,
  ListMarketsError,
} from '@polymarket/client/actions';
import { fetchMarket } from '@polymarket/client/actions';
import { describe, expectTypeOf, it } from 'vitest';
import { useClientAction } from '../read';
import { skip } from '../skip';
import { useOrderBook } from './books';
import { useEvents } from './events';
import { useMarket, useMarkets } from './markets';

describe('read hook types', () => {
  it('types useMarket results with the action model and error union', () => {
    function Component() {
      const { data, error } = useMarket({ slug: 'some-market-slug' });

      expectTypeOf(data).toEqualTypeOf<Market | undefined>();
      expectTypeOf(error).toEqualTypeOf<FetchMarketError | undefined>();
    }

    expectTypeOf(Component).toBeFunction();
  });

  it('types useOrderBook results with the action model and error union', () => {
    function Component() {
      const { data, error } = useOrderBook({ tokenId: '123' });

      expectTypeOf(data).toEqualTypeOf<OrderBook | undefined>();
      expectTypeOf(error).toEqualTypeOf<FetchOrderBookError | undefined>();
    }

    expectTypeOf(Component).toBeFunction();
  });

  it('types paginated hook data as flattened items', () => {
    function Component() {
      const markets = useMarkets({ closed: false });
      const events = useEvents();

      expectTypeOf(markets.data).toEqualTypeOf<Market[] | undefined>();
      expectTypeOf(markets.error).toEqualTypeOf<ListMarketsError | undefined>();
      expectTypeOf(events.data).toEqualTypeOf<Event[] | undefined>();
      expectTypeOf(events.error).toEqualTypeOf<ListEventsError | undefined>();
    }

    expectTypeOf(Component).toBeFunction();
  });

  it('accepts skip in place of any request', () => {
    function Component() {
      const market = useMarket(skip);
      const markets = useMarkets(skip);
      const events = useEvents(skip);
      const book = useOrderBook(skip);

      expectTypeOf(market.isPaused).toEqualTypeOf<boolean>();
      expectTypeOf(markets.isPaused).toEqualTypeOf<boolean>();
      expectTypeOf(events.isPaused).toEqualTypeOf<boolean>();
      expectTypeOf(book.isPaused).toEqualTypeOf<boolean>();
    }

    expectTypeOf(Component).toBeFunction();
  });

  it('infers useClientAction data from the action', () => {
    function Component() {
      const { data } = useClientAction(fetchMarket, { id: '123' });

      expectTypeOf(data).toEqualTypeOf<Market | undefined>();
    }

    expectTypeOf(Component).toBeFunction();
  });

  it('rejects requests that do not match the action', () => {
    function Component() {
      // @ts-expect-error - id must be a string
      useMarket({ id: 123 });
      // @ts-expect-error - unknown request member
      useOrderBook({ tokenId: '123', side: 'BUY' });
    }

    expectTypeOf(Component).toBeFunction();
  });
});
