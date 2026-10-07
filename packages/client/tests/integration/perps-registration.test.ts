import {
  FetchPerpsRegistrationError,
  UserInputError,
} from '@polymarket/client';
import { expectNonEmptyArray } from '@polymarket/types';
import { vi } from 'vitest';
import { describe, expect, it } from './fixtures';

describe('Perps registration lookup', () => {
  it('reads registration publicly and validates before dispatch', async ({
    publicClient,
  }) => {
    const sending = vi.spyOn(globalThis, 'fetch');
    const address = '0x0000000000000000000000000000000000000000';
    try {
      for (const invalid of ['not-an-address', '0x1234', `${address}00`]) {
        await expect(
          publicClient.fetchPerpsRegistration({ address: invalid }),
        ).rejects.toSatisfy(
          (error: unknown) =>
            error instanceof UserInputError &&
            FetchPerpsRegistrationError.isError(error),
        );
      }
      expect(sending).not.toHaveBeenCalled();

      const registered = await publicClient.fetchPerpsRegistration({ address });
      expect(typeof registered).toBe('boolean');
      expect(sending).toHaveBeenCalled();
      const [[input]] = expectNonEmptyArray(sending.mock.calls);
      const request = input instanceof Request ? input : new Request(input);
      const url = new URL(request.url);
      expect(request.method).toBe('GET');
      expect(url.pathname).toBe('/v1/info/registered');
      expect(url.searchParams.get('address')).toBe(address);
      expect(request.headers.has('polymarket-proxy')).toBe(false);
      expect(request.headers.has('polymarket-secret')).toBe(false);
    } finally {
      sending.mockRestore();
    }
  });
});
