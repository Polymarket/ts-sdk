import {
  type Market,
  MarketSchema,
  ProtocolVersion,
} from '@polymarket/bindings/gamma';
import { describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../errors';
import {
  normalizeMarketPositionContext,
  PositionProtocol,
} from './positions-market';

describe('market position routing', () => {
  it.each([
    [ProtocolVersion.V1, PositionProtocol.CTF, ['11', '12']],
    [ProtocolVersion.V2, PositionProtocol.V2, ['21', '22']],
  ])('routes mixed IDs with version %s to %s', (version, protocol, outcomeIds) => {
    const market = marketWithBothIds(version);

    expect(normalizeMarketPositionContext(market, 'test market')).toMatchObject(
      {
        marketId: market.id,
        conditionId: market.conditionId,
        protocol,
        outcomeIds,
      },
    );
  });

  it.each([
    undefined,
    null,
  ])('rejects version %s regardless of available IDs', (version) => {
    for (const ids of ['both', 'ctf', 'v2', 'neither']) {
      const market = marketWithBothIds(version);
      if (ids === 'v2' || ids === 'neither') {
        market.outcomes.yes.tokenId = null;
        market.outcomes.no.tokenId = null;
      }
      if (ids === 'ctf' || ids === 'neither') {
        market.outcomes.yes.positionId = null;
        market.outcomes.no.positionId = null;
      }

      expect(() =>
        normalizeMarketPositionContext(market, 'test market'),
      ).toThrow(
        new UnexpectedResponseError('Missing market version for test market'),
      );
    }
  });

  it.each([
    [ProtocolVersion.V1, 'tokenId', 'token'],
    [ProtocolVersion.V2, 'positionId', 'position'],
  ] as const)('rejects missing %s IDs instead of switching protocols', (version, missingId, label) => {
    const market = marketWithBothIds(version);
    market.outcomes.yes[missingId] = null;
    market.outcomes.no[missingId] = null;

    expect(() => normalizeMarketPositionContext(market, 'test market')).toThrow(
      new UnexpectedResponseError(
        `Missing market ${label} IDs for test market`,
      ),
    );
  });

  it('rejects incomplete Protocol V2 position IDs', () => {
    const market = marketWithBothIds(ProtocolVersion.V2);
    market.outcomes.no.positionId = null;

    expect(() => normalizeMarketPositionContext(market, 'test market')).toThrow(
      new UnexpectedResponseError(
        'Incomplete market position IDs for test market',
      ),
    );
  });

  it('does not require legacy IDs or a negative-risk flag for V2 routing', () => {
    const market = marketWithBothIds(ProtocolVersion.V2);
    market.outcomes.no.tokenId = null;
    market.state.negRisk = null;

    expect(normalizeMarketPositionContext(market, 'test market')).toMatchObject(
      {
        protocol: PositionProtocol.V2,
        outcomeIds: ['21', '22'],
      },
    );
  });

  it('ignores incomplete Protocol V2 position IDs for an explicitly V1 market', () => {
    const market = marketWithBothIds(ProtocolVersion.V1);
    market.outcomes.no.positionId = null;

    expect(normalizeMarketPositionContext(market, 'test market')).toMatchObject(
      {
        protocol: PositionProtocol.CTF,
        outcomeIds: ['11', '12'],
        negRisk: false,
      },
    );
  });
});

function marketWithBothIds(
  version: ProtocolVersion | null | undefined,
): Market {
  return MarketSchema.parse({
    id: '1',
    conditionId: `0x01${'00'.repeat(30)}`,
    version,
    outcomes: '["Yes", "No"]',
    clobTokenIds: '["11", "12"]',
    positionIds: '["21", "22"]',
    negRisk: false,
  });
}
