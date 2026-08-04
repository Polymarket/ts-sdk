import { describe, expect, it, vi } from 'vitest';
import { TransportError, UserInputError } from '../errors';
import { createPublicClient, SubscribeError } from '../index';

describe('SubscribeError', () => {
  it('recognizes every documented subscription error', () => {
    expect(SubscribeError.isError(new UserInputError('invalid window'))).toBe(
      true,
    );
    expect(
      SubscribeError.isError(new TransportError('connection failed')),
    ).toBe(true);
    expect(SubscribeError.isError(new Error('unexpected'))).toBe(false);
  });
});

describe('PublicClient.subscribe', () => {
  it('validates a batch before opening any subscriptions', async () => {
    const client = createPublicClient();
    const subscribe = vi.spyOn(client.webSockets.rtds, 'subscribe');

    const error = await client
      .subscribe([
        { topic: 'prices.crypto.chainlink' },
        {
          topic: 'prices.crypto.chainlink.twap',
          windowSeconds: 45,
        } as never,
      ])
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(UserInputError);
    expect(error).toHaveProperty(
      'message',
      expect.stringContaining('- windowSeconds: Invalid input'),
    );
    expect(subscribe).not.toHaveBeenCalled();
  });
});
