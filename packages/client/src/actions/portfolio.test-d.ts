import { ComboPositionStatus } from '@polymarket/bindings/data';
import { describe, expectTypeOf, it } from 'vitest';
import type {
  ClobRedeemActivity,
  ComboConditionId,
  ComboRedemptionActivity,
  ComboTradeActivity,
  ConditionId,
  PublicClient,
} from '../index';
import { ActivityType } from '../index';
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

declare const activityClient: PublicClient;
describe('public activity result types', () => {
  it('narrows combo outcomes and redemption identities through the public client', async () => {
    const page = await activityClient.listActivity({ user }).firstPage();
    for (const activity of page.items) {
      if (activity.type === ActivityType.TRADE && activity.isCombo) {
        expectTypeOf(activity).toEqualTypeOf<ComboTradeActivity>();
        expectTypeOf(activity.outcome).toEqualTypeOf<string | undefined>();
        expectTypeOf(activity.outcomeIndex).toEqualTypeOf<number | undefined>();
      }
      if (activity.type === ActivityType.REDEEM) {
        if (activity.isCombo) {
          expectTypeOf(activity).toEqualTypeOf<ComboRedemptionActivity>();
          expectTypeOf(activity.conditionId).toEqualTypeOf<ComboConditionId>();
          // @ts-expect-error A basket has no single market URL slug.
          void activity.slug;
        } else {
          expectTypeOf(activity).toEqualTypeOf<ClobRedeemActivity>();
          expectTypeOf(activity.conditionId).toEqualTypeOf<ConditionId>();
          expectTypeOf(activity.slug).toEqualTypeOf<string>();
        }
        expectTypeOf(activity.outcome).toEqualTypeOf<string | undefined>();
        expectTypeOf(activity.outcomeIndex).toEqualTypeOf<number | undefined>();
      }
    }
  });
});
