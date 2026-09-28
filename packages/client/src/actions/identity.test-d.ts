import { describe, expectTypeOf, it } from 'vitest';
import type {
  PlatformKeyIdentity,
  PredictionsIdentity,
  PredictionsSession,
  PublicIdentityActions,
  SecureIdentityActions,
} from '../index';

declare const publicActions: PublicIdentityActions;
declare const secureActions: SecureIdentityActions;
declare const session: PredictionsSession;

describe('predictions identity public surface', () => {
  it('keeps platform identity distinct from wallet session identity', () => {
    expectTypeOf(publicActions.fetchIdentity()).toEqualTypeOf<
      Promise<PlatformKeyIdentity>
    >();
    expectTypeOf(secureActions.openPredictionsSession()).toEqualTypeOf<
      Promise<PredictionsSession>
    >();
    expectTypeOf(session.fetchIdentity()).toEqualTypeOf<
      Promise<PredictionsIdentity>
    >();
    expectTypeOf(session.logout()).toEqualTypeOf<Promise<void>>();
    // @ts-expect-error Public clients cannot open signer-backed sessions.
    publicActions.openPredictionsSession();
    // @ts-expect-error Session credentials stay private.
    session.accessToken;
    // @ts-expect-error Signer and wallet come from the secure client.
    secureActions.openPredictionsSession({
      signer: '0x1111111111111111111111111111111111111111',
    });
  });
});
