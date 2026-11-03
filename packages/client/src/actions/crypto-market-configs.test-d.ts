import type { CryptoMarketConfig } from '@polymarket/bindings/gamma';
import { expectTypeOf, it } from 'vitest';
import type { PublicClient, SecureClient } from '../clients';
import { type FetchCryptoMarketConfigsError, UserInputError } from '../index';
import type { RequestOptions } from '../request-options';

it('exposes the catalog on public and secure clients with read options', () => {
  expectTypeOf<
    PublicClient['fetchCryptoMarketConfigs']
  >().returns.toEqualTypeOf<Promise<CryptoMarketConfig[]>>();
  expectTypeOf<
    SecureClient['fetchCryptoMarketConfigs']
  >().parameters.toEqualTypeOf<[options?: RequestOptions]>();
  expectTypeOf(
    new UserInputError('invalid'),
  ).toMatchTypeOf<FetchCryptoMarketConfigsError>();
});
