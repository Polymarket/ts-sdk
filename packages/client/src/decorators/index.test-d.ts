import { describe, expectTypeOf, it } from 'vitest';
import type * as actions from '../actions';
import type { PublicActions, SecureActions } from './index';

type Actions = typeof actions;

type Loosen<T extends unknown[]> = { [I in keyof T]: unknown };

// A bound action with fewer parameters than its decorator method still
// type-checks, so trailing arguments such as `{ signal }` would be dropped.
// Curried actions return the bound method and are skipped.
type AcceptsAllArguments<TAction, TMethod> = TAction extends (
  ...args: never[]
) => (...args: never[]) => unknown
  ? true
  : TAction extends (...args: infer A) => unknown
    ? TMethod extends (...args: infer M) => unknown
      ? Required<A> extends [unknown, ...Loosen<Required<M>>, ...unknown[]]
        ? true
        : false
      : true
    : true;

type DroppedArguments<TMethods> = {
  [K in keyof TMethods & keyof Actions]: AcceptsAllArguments<
    Actions[K],
    TMethods[K]
  > extends true
    ? never
    : K;
}[keyof TMethods & keyof Actions];

describe('decorator argument forwarding', () => {
  it('forwards every public client method argument to its action', () => {
    expectTypeOf<DroppedArguments<PublicActions>>().toEqualTypeOf<never>();
  });

  it('forwards every secure client method argument to its action', () => {
    expectTypeOf<DroppedArguments<SecureActions>>().toEqualTypeOf<never>();
  });
});
