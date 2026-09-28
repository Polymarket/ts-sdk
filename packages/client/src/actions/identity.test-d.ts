import { describe, expectTypeOf, it } from 'vitest';
import type {
  createPublicClient,
  createSecureClient,
  PlatformKeyIdentity,
  PredictionsIdentity,
  PredictionsSession,
} from '../index';

declare const publicClient: ReturnType<typeof createPublicClient>;
declare const secureClient: Awaited<ReturnType<typeof createSecureClient>>;
declare const session: PredictionsSession;

describe('predictions identity public surface', () => {
  it('keeps platform identity distinct from wallet session identity', () => {
    expectTypeOf(publicClient.fetchIdentity()).toEqualTypeOf<
      Promise<PlatformKeyIdentity>
    >();
    expectTypeOf(secureClient.openPredictionsSession()).toEqualTypeOf<
      Promise<PredictionsSession>
    >();
    expectTypeOf(session.fetchIdentity()).toEqualTypeOf<
      Promise<PredictionsIdentity>
    >();
    expectTypeOf(session.logout()).toEqualTypeOf<Promise<void>>();
    // @ts-expect-error Public clients cannot open signer-backed sessions.
    publicClient.openPredictionsSession();
    // @ts-expect-error Session credentials stay private.
    session.accessToken;
    // @ts-expect-error Signer and wallet come from the secure client.
    secureClient.openPredictionsSession({
      signer: '0x1111111111111111111111111111111111111111',
    });
  });
});
