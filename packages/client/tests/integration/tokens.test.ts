import { UserInputError } from '@polymarket/client';
import { afterEach, vi } from 'vitest';
import { describe, expect, it } from './fixtures';

const CONDITION = `0x${'ab'.repeat(32)}`;
const invalidRequests = [
  {},
  { assetIds: [] },
  { assetIds: ['', ' '] },
  { assetIds: ['1'], conditionIds: [] },
  { assetIds: ['1'], conditionIds: [CONDITION] },
  { assetIds: ['1,2'] },
  { assetIds: ['1e5'] },
  { assetIds: ['0x1f'] },
  { assetIds: ['-3'] },
  { assetIds: ['١'] },
  { assetIds: ['1'.repeat(79)] },
  { assetIds: Array.from({ length: 51 }, (_, i) => String(i)) },
  {
    conditionIds: Array.from(
      { length: 11 },
      (_, i) => `0x${i.toString(16).padStart(64, '0')}`,
    ),
  },
  { conditionIds: [`0X${'a'.repeat(64)}`] },
  { conditionIds: [`0x${'a'.repeat(63)}`] },
  { conditionIds: [`0x${'z'.repeat(64)}`] },
];

describe('token reference lookup', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(
    invalidRequests,
  )('rejects invalid selectors before transport: %j', async (request) => {
    const { publicClient } = await import('./fixtures');
    const fetch = vi.spyOn(globalThis, 'fetch');
    // @ts-expect-error Deliberately exercise the runtime input boundary.
    await expect(publicClient.fetchTokenReferences(request)).rejects.toThrow(
      UserInputError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('encodes canonical decimal selectors and returns a direct collection', async ({
    publicClient,
  }) => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const references = await publicClient.fetchTokenReferences({
      assetIds: [' 000 ', '', '9'.repeat(78), '0'],
    });
    expect(Array.isArray(references)).toBe(true);
    const [input] = fetch.mock.calls[0] ?? [];
    const url = new URL(input instanceof Request ? input.url : String(input));
    expect(url.pathname).toBe('/v2/tokens');
    expect(url.searchParams.get('token_id')).toBe(`0,${'9'.repeat(78)}`);
    expect(url.searchParams.has('condition')).toBe(false);
  });

  it('preserves both condition selector widths while lowercasing and deduplicating', async ({
    publicClient,
  }) => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const short = `0x03${'cd'.repeat(30)}`;
    await publicClient.fetchTokenReferences({
      conditionIds: [
        ` ${short.toUpperCase().replace('0X', '0x')} `,
        CONDITION,
        short,
      ],
    });
    const [input] = fetch.mock.calls[0] ?? [];
    const url = new URL(input instanceof Request ? input.url : String(input));
    expect(url.searchParams.get('condition')).toBe(`${short},${CONDITION}`);
    expect(url.searchParams.has('token_id')).toBe(false);
  });
});
