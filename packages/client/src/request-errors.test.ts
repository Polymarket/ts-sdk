import { expect, it } from 'vitest';
import { TransportError } from './errors';
import { protectRequestErrors } from './request-errors';

it.each([
  [new Error('offline failure'), 'Authentication transport failed.'],
  [
    new Error('offline failure: synthetic-secret'),
    'Authentication transport failed.',
  ],
  [
    new TransportError('offline failure: synthetic-secret'),
    'offline failure: [REDACTED]',
  ],
])('preserves the sensitive fallback for %s', async (error, message) => {
  const fetch = protectRequestErrors(async () => {
    throw error;
  }, true);
  await expect(
    fetch(
      new Request('https://offline.invalid/private', {
        headers: { 'x-api-key': 'synthetic-secret' },
      }),
    ),
  ).rejects.toMatchObject({ name: 'TransportError', message });
});
