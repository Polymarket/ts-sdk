import { describe, expect, it } from 'vitest';
import { OrderSide, TokenIdSchema } from '../shared';
import { MidpointsSchema, PricesSchema, SpreadsSchema } from './market-data';

const TOKEN_ID =
  '8501497159083948713316135768103773293754490207922884688769443031624417212426';

describe('MidpointsSchema', () => {
  it('parses midpoint prices keyed by token ID', () => {
    const tokenId = TokenIdSchema.parse(TOKEN_ID);

    const midpoints = MidpointsSchema.parse({
      [tokenId]: '0.53',
    });

    expect(midpoints[tokenId]).toBe('0.53');
  });
});

describe('PricesSchema', () => {
  it('parses prices keyed by token ID with partial side records', () => {
    const tokenId = TokenIdSchema.parse(TOKEN_ID);

    const prices = PricesSchema.parse({
      [tokenId]: {
        [OrderSide.BUY]: '0.52',
      },
    });

    expect(prices[tokenId]?.[OrderSide.BUY]).toBe('0.52');
    expect(prices[tokenId]?.[OrderSide.SELL]).toBeUndefined();
  });

  it('rejects unknown side keys', () => {
    const tokenId = TokenIdSchema.parse(TOKEN_ID);

    expect(() =>
      PricesSchema.parse({
        [tokenId]: {
          HOLD: '0.52',
        },
      }),
    ).toThrow();
  });
});

describe('SpreadsSchema', () => {
  it('parses spreads keyed by token ID', () => {
    const tokenId = TokenIdSchema.parse(TOKEN_ID);

    const spreads = SpreadsSchema.parse({
      [tokenId]: '0.02',
    });

    expect(spreads[tokenId]).toBe('0.02');
  });
});
