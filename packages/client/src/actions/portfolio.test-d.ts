import { ComboPositionStatus } from '@polymarket/bindings/data';
import { describe, expectTypeOf, it } from 'vitest';
import type {
  ActivityBase,
  ComboConditionId,
  ConditionId,
  DecimalString,
  MergeActivity,
  OpaqueActivityType,
  PublicClient,
  RedeemActivity,
  SplitActivity,
  TipSide,
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
      if (
        activity.type === ActivityType.SPLIT ||
        activity.type === ActivityType.MERGE ||
        activity.type === ActivityType.REDEEM
      ) {
        if (activity.isCombo) {
          expectTypeOf(activity.conditionId).toEqualTypeOf<ComboConditionId>();
          expectTypeOf(activity.title).toEqualTypeOf<string | undefined>();
          // @ts-expect-error A basket has no single market URL slug.
          void activity.slug;
          // @ts-expect-error A basket has no single event URL slug.
          void activity.eventSlug;
          if (activity.type === ActivityType.REDEEM) {
            // @ts-expect-error A basket has no single market URL slug.
            void activity.slug;
          }
        } else {
          expectTypeOf(activity.conditionId).toEqualTypeOf<
            ConditionId | undefined
          >();
          expectTypeOf(activity.title).toEqualTypeOf<string | undefined>();
          expectTypeOf(activity.slug).toEqualTypeOf<string | undefined>();
          expectTypeOf(activity.eventSlug).toEqualTypeOf<string | undefined>();
        }
      }
      if (
        (activity.type === ActivityType.TRADE && activity.isCombo) ||
        activity.type === ActivityType.REDEEM
      ) {
        expectTypeOf(activity.outcome).toEqualTypeOf<string | undefined>();
        expectTypeOf(activity.outcomeIndex).toEqualTypeOf<number | undefined>();
      }
      if (
        activity.type === ActivityType.DIRECTIONAL_SPLIT ||
        activity.type === ActivityType.DIRECTIONAL_MERGE
      ) {
        expectTypeOf(activity.eventSlug).toEqualTypeOf<string | undefined>();
        // @ts-expect-error A range-event row has no single market.
        void activity.conditionId;
      }
      if (
        activity.type === ActivityType.THRESHOLD_COMPOSE ||
        activity.type === ActivityType.THRESHOLD_DECOMPOSE
      ) {
        expectTypeOf(activity.conditionId).toEqualTypeOf<ConditionId>();
        expectTypeOf(activity.shares).toEqualTypeOf<DecimalString>();
        expectTypeOf(activity.outcome).toEqualTypeOf<string | undefined>();
        // @ts-expect-error No collateral moves, so there is no USD amount.
        void activity.amount;
      }
      switch (activity.type) {
        case ActivityType.TIP:
          expectTypeOf(activity.side).toEqualTypeOf<TipSide | null>();
          break;
        case ActivityType.TRADE:
        case ActivityType.SPLIT:
        case ActivityType.MERGE:
        case ActivityType.REDEEM:
        case ActivityType.REWARD:
        case ActivityType.CONVERSION:
        case ActivityType.MIGRATION:
        case ActivityType.MAKER_REBATE:
        case ActivityType.REFERRAL_REWARD:
        case ActivityType.YIELD:
        case ActivityType.DEPOSIT:
        case ActivityType.WITHDRAWAL:
        case ActivityType.TAKER_REBATE:
        case ActivityType.DIRECTIONAL_SPLIT:
        case ActivityType.DIRECTIONAL_MERGE:
        case ActivityType.THRESHOLD_COMPOSE:
        case ActivityType.THRESHOLD_DECOMPOSE:
          break;
        default: {
          // Every listed type is handled above, yet rows with types this
          // version does not list still reach here with only shared fields.
          expectTypeOf(activity).toEqualTypeOf<
            ActivityBase & { type: OpaqueActivityType }
          >();
          // @ts-expect-error The activity union stays open to unlisted types.
          const exhaustive: never = activity;
          void exhaustive;
        }
      }
      // @ts-expect-error An unlisted type cannot be matched by its string.
      void (activity.type === 'NEW_ACTIVITY_TYPE');
    }
  });
});

declare const legacyBase: ActivityBase;
declare const marketConditionId: ConditionId;
declare const collateralAmount: DecimalString;

it('retains ordinary object construction without an explicit Combo flag', () => {
  const metadata = {
    ...legacyBase,
    conditionId: marketConditionId,
    amount: collateralAmount,
    title: 'A market',
    slug: 'a-market',
    eventSlug: 'an-event',
    icon: null,
  };
  void ({ ...metadata, type: 'SPLIT' } satisfies SplitActivity);
  void ({ ...metadata, type: 'MERGE' } satisfies MergeActivity);
  void ({ ...metadata, type: 'REDEEM' } satisfies RedeemActivity);
});
