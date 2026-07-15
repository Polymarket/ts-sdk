import { describe, expect, it } from 'vitest';
import { OrderSide, TokenIdSchema } from '../shared';
import { PricesSchema } from './market-data';

describe('PricesSchema', () => {
  it('parses prices keyed by token ID with partial side records', () => {
    const tokenId = TokenIdSchema.parse(
      '8501497159083948713316135768103773293754490207922884688769443031624417212426',
    );

    const prices = PricesSchema.parse({
      [tokenId]: {
        [OrderSide.BUY]: '0.52',
      },
    });

    expect(prices[tokenId]?.[OrderSide.BUY]).toBe('0.52');
    expect(prices[tokenId]?.[OrderSide.SELL]).toBeUndefined();
  });

  it('rejects unknown side keys', () => {
    const tokenId = TokenIdSchema.parse(
      '8501497159083948713316135768103773293754490207922884688769443031624417212426',
    );

    expect(() =>
      PricesSchema.parse({
        [tokenId]: {
          HOLD: '0.52',
        },
      }),
    ).toThrow();
  });
});
