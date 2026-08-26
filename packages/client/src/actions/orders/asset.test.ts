import { describe, expect, it } from 'vitest';
import { ExchangeOrderProtocolVersion } from '../../exchange';
import { createOrderRouting } from './asset';

const CTF_TOKEN_ID =
  '8501497159083948713316135768103773293754490207922884688769443031624417212426';
const V2_POSITION_ID =
  '512621228394368573489767381548878758725236764214074924933294838260328038400';

describe('createOrderRouting', () => {
  it('routes an asset with the reserved bits cleared through Exchange V3', () => {
    expect(createOrderRouting(V2_POSITION_ID)).toEqual({
      assetId: V2_POSITION_ID,
      exchangeVersion: ExchangeOrderProtocolVersion.V3,
    });
  });

  it('routes an asset with a reserved bit set through the CTF exchange', () => {
    const assetId = (BigInt(V2_POSITION_ID) | (1n << 40n)).toString();

    expect(createOrderRouting(assetId)).toEqual({
      assetId,
      exchangeVersion: ExchangeOrderProtocolVersion.V2,
    });
  });

  it('routes a representative CTF token ID through the CTF exchange', () => {
    expect(createOrderRouting(CTF_TOKEN_ID)).toEqual({
      assetId: CTF_TOKEN_ID,
      exchangeVersion: ExchangeOrderProtocolVersion.V2,
    });
  });
});
