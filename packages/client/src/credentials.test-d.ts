import { ApiKeySchema, type BearerCredentials } from '@polymarket/bindings';
import type { ApiKeyCreds } from '@polymarket/bindings/clob';
import { expectTypeOf, it } from 'vitest';
import type { ClientCredentials } from './credentials';
import type { ClientCredentials as ExportedCredentials } from './index';
import type { ServiceAuthentication } from './ServiceClient';

it('exports the existing credential alternatives and narrows each complete mechanism', () => {
  expectTypeOf<ClientCredentials>().toEqualTypeOf<
    ApiKeyCreds | BearerCredentials
  >();
  expectTypeOf<ExportedCredentials>().toEqualTypeOf<ClientCredentials>();
  function inspect(credentials: ClientCredentials) {
    if ('key' in credentials) {
      expectTypeOf(credentials).toEqualTypeOf<ApiKeyCreds>();
      expectTypeOf(credentials.secret).toEqualTypeOf<string>();
      // @ts-expect-error Narrowed legacy credentials do not expose bearer fields.
      credentials.accessToken;
    } else {
      expectTypeOf(credentials).toEqualTypeOf<BearerCredentials>();
      expectTypeOf(credentials.refreshToken).toEqualTypeOf<string>();
      // @ts-expect-error Narrowed bearer credentials do not expose legacy fields.
      credentials.key;
    }
  }
  const policy: ServiceAuthentication = {
    credentials: async () => ({
      accessToken: 'opaque',
      refreshToken: 'opaque-refresh',
    }),
    headers: (credentials) => {
      inspect(credentials);
      return {};
    },
    refreshToken: async (credentials) => {
      inspect(credentials);
      return false;
    },
  };
  expectTypeOf(policy.credentials()).toEqualTypeOf<
    Promise<ClientCredentials>
  >();
  // @ts-expect-error Both bearer fields are required.
  const incomplete: ClientCredentials = { accessToken: 'opaque' };
  // @ts-expect-error All three legacy fields are required.
  const incompleteLegacy: ClientCredentials = {
    key: ApiKeySchema.parse('saved-key'),
    secret: 'secret',
  };
  void incomplete;
  void incompleteLegacy;
});
