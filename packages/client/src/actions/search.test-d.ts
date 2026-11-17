import type { MarketId } from '@polymarket/bindings';
import type { SearchEvent, SearchMarket } from '@polymarket/bindings/gamma';
import { expectTypeOf, it } from 'vitest';
import type { PublicClient } from '../clients';
import type { Paginated } from '../pagination';
import type { SearchResults } from './search';

it('exposes search summary identifiers as optional', () => {
  expectTypeOf<PublicClient['search']>().returns.toEqualTypeOf<
    Paginated<SearchResults>
  >();
  expectTypeOf<SearchResults['events']>().toEqualTypeOf<SearchEvent[]>();
  expectTypeOf<SearchEvent['markets']>().toEqualTypeOf<SearchMarket[]>();
  expectTypeOf<SearchMarket['id']>().toEqualTypeOf<MarketId | undefined>();
});
