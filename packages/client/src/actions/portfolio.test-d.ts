import { ComboPositionStatus } from '@polymarket/bindings/data';
import { describe, it } from 'vitest';
import type { ListComboPositionsRequest } from './portfolio';

const user = '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b';

describe('combo position status filter types', () => {
  it('accepts a scalar or readonly non-empty status array', () => {
    const statuses = [
      ComboPositionStatus.ResolvedWin,
      ComboPositionStatus.ResolvedPartial,
    ] as const;
    const scalarRequest = {
      user,
      status: ComboPositionStatus.Open,
    } satisfies ListComboPositionsRequest;
    const multiRequest = {
      user,
      status: statuses,
    } satisfies ListComboPositionsRequest;

    void scalarRequest;
    void multiRequest;
  });

  it('rejects raw comma strings and empty arrays', () => {
    const commaSeparatedRequest = {
      user,
      // @ts-expect-error Pass multiple statuses as a non-empty array.
      status: `${ComboPositionStatus.Open},${ComboPositionStatus.Partial}`,
    } satisfies ListComboPositionsRequest;
    const emptyRequest = {
      user,
      // @ts-expect-error Status arrays must be non-empty.
      status: [] as const,
    } satisfies ListComboPositionsRequest;

    void commaSeparatedRequest;
    void emptyRequest;
  });
});
