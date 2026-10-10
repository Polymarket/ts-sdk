import type { Event } from '@polymarket/bindings/gamma';
import { ProtocolVersion, type PublicClient } from '@polymarket/client';
import { type ListEventsRequest, listEvents } from '@polymarket/client/actions';
import { describe, expectTypeOf, it } from 'vitest';
import type { Paginated } from '../pagination';

declare const client: PublicClient;

describe('event list protocol filter types', () => {
  it('retains scalar enum filters on flat and public client methods', () => {
    expectTypeOf(client.listEvents()).toEqualTypeOf<Paginated<Event[]>>();
    for (const version of [ProtocolVersion.V1, ProtocolVersion.V2]) {
      const request = { version } satisfies ListEventsRequest;
      expectTypeOf(client.listEvents(request)).toEqualTypeOf<
        Paginated<Event[]>
      >();
      expectTypeOf(listEvents(client, request)).toEqualTypeOf<
        Paginated<Event[]>
      >();
    }

    // @ts-expect-error Protocol filters are scalar enum values.
    client.listEvents({ version: [ProtocolVersion.V1] });
    // @ts-expect-error Numeric protocol aliases are unsupported.
    client.listEvents({ version: 1 });
    // @ts-expect-error Unknown protocol versions are unsupported.
    client.listEvents({ version: 'v3' });
  });
});
