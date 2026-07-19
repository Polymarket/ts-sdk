import type {
  Event,
  InsufficientAllowanceError,
  Market,
  OrderBook,
  OrderResponse,
  Position,
  SignOrderRequest,
  TransactionOutcome,
  Value,
} from '@polymarket/client';
import type {
  CancelOrderRequest,
  FetchMarketError,
  FetchOrderBookError,
  ListEventsError,
  ListMarketsError,
  SearchResults,
} from '@polymarket/client/actions';
import { fetchMarket } from '@polymarket/client/actions';
import { describe, expectTypeOf, it } from 'vitest';
import { usePublicClientAction } from '../read';
import { skip } from '../skip';
import type {
  GaslessStep,
  WorkflowCancelled,
  WorkflowHandler,
  WorkflowResponse,
} from '../workflow';
import { useTradingRestriction } from './account';
import { useSetupTradingApprovals } from './approvals';
import { useEstimatedMarketPrice, useOrderBook } from './books';
import { useSearch } from './discovery';
import { useEvents } from './events';
import { useMarket, useMarkets } from './markets';
import { usePortfolioValue, usePositions } from './portfolio';
import { useRedeemPositions } from './positions';
import type { UsePlaceMarketOrderError } from './trading';
import {
  useCancelOrder,
  usePlaceLimitOrder,
  usePlaceMarketOrder,
} from './trading';

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

  it('infers usePublicClientAction data from the action', () => {
    function Component() {
      const { data } = usePublicClientAction(fetchMarket, { id: '123' });

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

describe('portfolio hook types', () => {
  it('makes user optional on session-defaulted reads', () => {
    function Component() {
      const mine = usePositions();
      const theirs = usePositions({ user: `0x${'2'.repeat(40)}` });
      const value = usePortfolioValue();

      expectTypeOf(mine.data).toEqualTypeOf<Position[] | undefined>();
      expectTypeOf(theirs.isPaused).toEqualTypeOf<boolean>();
      expectTypeOf(value.data).toEqualTypeOf<Value[] | undefined>();
    }

    expectTypeOf(Component).toBeFunction();
  });

  it('types the market price estimate read', () => {
    function Component() {
      const { data, isPaused } = useEstimatedMarketPrice(skip);

      expectTypeOf(data).toEqualTypeOf<number | undefined>();
      expectTypeOf(isPaused).toEqualTypeOf<boolean>();
    }

    expectTypeOf(Component).toBeFunction();
  });

  it('types the boolean trading restriction read', () => {
    function Component() {
      const { data } = useTradingRestriction();

      expectTypeOf(data).toEqualTypeOf<boolean | undefined>();
    }

    expectTypeOf(Component).toBeFunction();
  });
});

describe('write hook types', () => {
  it('narrows the placement handler to signOrder and accepts a broad handler', () => {
    function Component(broad: WorkflowHandler) {
      const [placeOrder, state] = usePlaceMarketOrder(broad);

      expectTypeOf(placeOrder).returns.toEqualTypeOf<Promise<OrderResponse>>();
      expectTypeOf(state.data).toEqualTypeOf<OrderResponse | undefined>();
      expectTypeOf(state.step).toEqualTypeOf<'signOrder' | undefined>();

      const narrow: WorkflowHandler<SignOrderRequest> = broad;
      usePlaceLimitOrder(narrow);
    }

    expectTypeOf(Component).toBeFunction();
  });

  it('includes InsufficientAllowanceError in the placement error unions', () => {
    function Component(error: UsePlaceMarketOrderError | undefined) {
      if (
        error instanceof Error &&
        error.name === 'InsufficientAllowanceError'
      ) {
        expectTypeOf(error).toEqualTypeOf<InsufficientAllowanceError>();
      }
    }

    expectTypeOf(Component).toBeFunction();
  });

  it('narrows the approvals handler to the gasless step kinds', () => {
    function Component(broad: WorkflowHandler) {
      const [setupApprovals, state] = useSetupTradingApprovals(broad);

      expectTypeOf(setupApprovals).returns.toEqualTypeOf<Promise<void>>();
      expectTypeOf(state.step).toEqualTypeOf<GaslessStep | undefined>();
    }

    function RejectsMismatchedHandler(
      signOrderOnly: (
        request: SignOrderRequest,
      ) => Promise<WorkflowResponse | WorkflowCancelled>,
    ) {
      // @ts-expect-error - a signOrder-only handler cannot answer gasless steps
      useSetupTradingApprovals(signOrderOnly);
    }

    expectTypeOf(Component).toBeFunction();
    expectTypeOf(RejectsMismatchedHandler).toBeFunction();
  });

  it('types the gasless lifecycle writes with confirmation outcomes', () => {
    function Component(broad: WorkflowHandler) {
      const [redeem, state] = useRedeemPositions(broad);

      expectTypeOf(redeem).returns.toEqualTypeOf<Promise<TransactionOutcome>>();
      expectTypeOf(state.step).toEqualTypeOf<GaslessStep | undefined>();
    }

    expectTypeOf(Component).toBeFunction();
  });

  it('types search as grouped first-page results', () => {
    function Component() {
      const { data } = useSearch({ q: 'election' });

      expectTypeOf(data).toEqualTypeOf<SearchResults | undefined>();
    }

    expectTypeOf(Component).toBeFunction();
  });

  it('exposes no step on the cancel hook state', () => {
    function Component() {
      const [cancel, state] = useCancelOrder();

      expectTypeOf(cancel).parameter(0).toEqualTypeOf<CancelOrderRequest>();
      expectTypeOf(state).not.toHaveProperty('step');
    }

    expectTypeOf(Component).toBeFunction();
  });
});
