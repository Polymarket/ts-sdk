import { expect, it } from 'vitest';
import { ClientCredentialsSchema } from './credentials';

it('validates saved credentials without selecting a mechanism from mixed or incomplete input', () => {
  const bearer = { accessToken: 'access', refreshToken: 'refresh' };
  const l2 = {
    key: '00000000-0000-0000-0000-000000000001',
    secret: 'secret',
    passphrase: 'passphrase',
  };
  expect(ClientCredentialsSchema.parse(bearer)).toEqual(bearer);
  expect(ClientCredentialsSchema.parse(l2)).toEqual(l2);
  for (const untrusted of [
    { ...bearer, ...l2 },
    { ...bearer, expiresIn: 900 },
    { accessToken: 'access' },
    { key: l2.key, secret: 'secret' },
  ])
    expect(ClientCredentialsSchema.safeParse(untrusted).success).toBe(false);
});
