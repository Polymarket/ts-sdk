import { describe, expect, it } from 'vitest';
import {
  RelayerAuthorizeSessionSignerRequestSchema,
  RelayerSessionSignerKnownScope,
} from './session-signer';

describe('RelayerAuthorizeSessionSignerRequestSchema', () => {
  it('preserves scopes introduced after the bindings release', () => {
    const request = RelayerAuthorizeSessionSignerRequestSchema.parse({
      deadline: '1770000000',
      nonce: '1',
      scopes: [RelayerSessionSignerKnownScope.CLOB, 'FUTURE_SCOPE'],
      sessionSignerAddress: '0x1111111111111111111111111111111111111111',
      signature: `0x${'11'.repeat(65)}`,
      validUntil: '1760000000',
      walletAddress: '0x2222222222222222222222222222222222222222',
    });

    expect(request.scopes).toEqual([
      RelayerSessionSignerKnownScope.CLOB,
      'FUTURE_SCOPE',
    ]);
  });
});
