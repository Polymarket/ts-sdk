import {
  type ClobAssetId,
  createPublicClient,
  type DecimalString,
  type EventId,
  type SecureClient,
  type TokenModule,
  type TokenReference,
} from '@polymarket/client';
import { describe, expectTypeOf, it } from 'vitest';

describe('token lookup public methods', () => {
  it('returns precise direct models from primitive selectors', () => {
    const client = createPublicClient();
    expectTypeOf(
      client.fetchTokenReferences({ assetIds: ['123'] }),
    ).toEqualTypeOf<Promise<TokenReference[]>>();
    expectTypeOf(
      client.fetchTokenReferences({ conditionIds: [`0x${'a'.repeat(62)}`] }),
    ).toEqualTypeOf<Promise<TokenReference[]>>();
    // @ts-expect-error Exactly one selector family is required.
    client.fetchTokenReferences({});
    // @ts-expect-error Selector families are mutually exclusive.
    client.fetchTokenReferences({
      assetIds: ['123'],
      conditionIds: ['condition'],
    });
    // @ts-expect-error IDs are strings, not imprecise numeric values.
    client.fetchTokenReferences({ assetIds: [123] });
  });
});

function secureLookup(client: SecureClient, reference: TokenReference) {
  expectTypeOf(
    client.fetchTokenReferences({ assetIds: [reference.assetId] }),
  ).toEqualTypeOf<Promise<TokenReference[]>>();
  expectTypeOf(reference.assetId).toEqualTypeOf<ClobAssetId>();
  expectTypeOf(reference.finalPrice).toEqualTypeOf<DecimalString | null>();
  expectTypeOf(reference.eventId).toEqualTypeOf<EventId | null>();
  expectTypeOf(reference.module).toEqualTypeOf<TokenModule>();
}
void secureLookup;
