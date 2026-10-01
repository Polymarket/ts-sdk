import { toDecimalString, toEpochMilliseconds } from '@polymarket/bindings';
import {
  type CryptoPriceEvent,
  type EquityTwapPriceEvent,
  KnownPriceSource,
  type PriceSource,
  RealtimeKnownErrorCode,
} from '@polymarket/bindings/subscriptions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConnectionLostError,
  RequestRejectedError,
  TransportError,
} from '../../errors';
import type { PriceKey } from './protocol';
import {
  PriceSession,
  type PriceSessionConnection,
  type PriceSessionEvents,
  PriceSubscriptionOperation,
  type PriceSubscriptionRejection,
} from './session';

const sessions: PriceSession[] = [];
function setup() {
  let events: PriceSessionEvents | undefined;
  const connection = {
    open: vi.fn(async (callbacks: PriceSessionEvents) => {
      events = callbacks;
    }),
    authorize: vi.fn(async () => {}),
    change: vi.fn(
      async (
        _operation: PriceSubscriptionOperation,
        _subscriptions: readonly PriceKey[],
      ): Promise<PriceSubscriptionRejection[]> => [],
    ),
    close: vi.fn(async () => {}),
  } satisfies PriceSessionConnection;
  const session = new PriceSession(connection);
  sessions.push(session);
  return {
    session,
    connection,
    get events() {
      if (events === undefined) throw new Error('Session has not opened.');
      return events;
    },
  };
}
function listener() {
  return { event: vi.fn(), end: vi.fn() };
}
function crypto(symbol = 'btcusd'): PriceKey {
  return { key: symbol, topic: 'prices.crypto', symbol };
}
function price(
  timestamp = Date.now(),
  source: PriceSource = 'pyth',
): CryptoPriceEvent {
  return {
    topic: 'prices.crypto',
    type: 'update',
    timestamp: toEpochMilliseconds(timestamp),
    payload: {
      symbol: 'btcusd',
      source,
      timestamp: toEpochMilliseconds(timestamp),
      value: toDecimalString('1'),
      receivedAt: undefined,
      isCarriedForward: undefined,
    },
  };
}
function equityTwap(
  timestamp = Date.now(),
  source: PriceSource = 'chainlink',
): EquityTwapPriceEvent {
  return {
    topic: 'prices.equity.twap',
    type: 'update',
    timestamp: toEpochMilliseconds(timestamp),
    payload: {
      symbol: 'USDJPY',
      source,
      timestamp: toEpochMilliseconds(timestamp),
      value: toDecimalString('150.01'),
      windowSeconds: 60,
    },
  };
}
async function accept(
  session: PriceSession,
  subscription = crypto(),
  observer = listener(),
) {
  const pending = session.add(subscription, observer);
  await vi.advanceTimersByTimeAsync(20);
  await pending;
  return observer;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('price subscription policy', () => {
  it('bounds acceptance independently of an operation that never settles', async () => {
    const { session, connection } = setup();
    const operation = Promise.withResolvers<PriceSubscriptionRejection[]>();
    connection.change.mockReturnValueOnce(operation.promise);
    const pending = session.add(crypto(), listener());
    const assertion = expect(pending).rejects.toThrow('within 30 seconds');
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
    operation.resolve([]);
  });

  it('rejects initial open failures without retrying an unowned subscription', async () => {
    const { session, connection } = setup();
    connection.open.mockRejectedValueOnce(new TransportError('Unreachable.'));
    await expect(session.add(crypto(), listener())).rejects.toBeInstanceOf(
      TransportError,
    );
    await vi.advanceTimersByTimeAsync(2_000);
    expect(connection.open).toHaveBeenCalledTimes(1);
  });

  it('shares acceptance and only removes a key after its final listener leaves', async () => {
    const { session, connection } = setup();
    const first = listener();
    const second = listener();
    const pending = [
      session.add(crypto(), first),
      session.add(crypto(), second),
    ];
    await vi.advanceTimersByTimeAsync(20);
    await Promise.all(pending);
    expect(connection.change).toHaveBeenCalledTimes(1);
    session.remove('btcusd', first);
    await vi.advanceTimersByTimeAsync(20);
    expect(connection.change).toHaveBeenCalledTimes(1);
    session.remove('btcusd', second);
    await vi.advanceTimersByTimeAsync(20);
    expect(connection.change).toHaveBeenLastCalledWith(
      PriceSubscriptionOperation.Unsubscribe,
      [crypto()],
    );
  });

  it.each([
    RealtimeKnownErrorCode.BadFilter,
    'future_error_code',
  ])('rejects an ambiguous batch with %s without ending an established sibling', async (code) => {
    const harness = setup();
    const { session, connection } = harness;
    const existing = await accept(session);
    const rejection = new RequestRejectedError('Realtime request rejected.', {
      status: 200,
      code,
    });
    connection.change.mockRejectedValueOnce(rejection);
    const newcomer = listener();
    const assertion = expect(
      session.add(crypto('ethusd'), newcomer),
    ).rejects.toBe(rejection);
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    harness.events.event(price());
    expect(existing.event).toHaveBeenCalledOnce();
    expect(existing.end).not.toHaveBeenCalled();
    expect(newcomer.end).toHaveBeenCalledWith(rejection);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(connection.close).not.toHaveBeenCalled();
    expect(connection.open).toHaveBeenCalledOnce();
  });

  it('rejects only the identified item in a shared batch', async () => {
    const { session, connection } = setup();
    const rejected = listener();
    const accepted = listener();
    const error = new RequestRejectedError('Realtime request rejected.', {
      status: 200,
      code: RealtimeKnownErrorCode.BadFilter,
    });
    connection.change.mockResolvedValueOnce([{ key: 'ethusd', error }]);
    const bad = expect(session.add(crypto('ethusd'), rejected)).rejects.toBe(
      error,
    );
    const good = session.add(crypto(), accepted);
    await vi.advanceTimersByTimeAsync(20);
    await bad;
    await good;
    expect(accepted.end).not.toHaveBeenCalled();
    expect(session.has('btcusd')).toBe(true);
    expect(session.has('ethusd')).toBe(false);
  });

  it.each([
    'ack timeout',
    'send failure',
  ])('restarts after %s while preserving sibling listeners', async (failure) => {
    const harness = setup();
    const { session, connection } = harness;
    const existing = await accept(session);
    connection.change.mockRejectedValueOnce(new TransportError(failure));
    const joining = session.add(crypto('ethusd'), listener());
    await vi.advanceTimersByTimeAsync(1_000);
    await joining;
    harness.events.event(price());
    expect(connection.close).toHaveBeenCalledOnce();
    expect(connection.open).toHaveBeenCalledTimes(2);
    expect(existing.end).not.toHaveBeenCalled();
    expect(existing.event).toHaveBeenCalledOnce();
    expect(connection.change).toHaveBeenLastCalledWith(
      PriceSubscriptionOperation.Subscribe,
      [crypto(), crypto('ethusd')],
    );
  });

  it('waits for restart teardown before opening a joining subscription', async () => {
    const { session, connection } = setup();
    const teardown = Promise.withResolvers<void>();
    connection.close.mockReturnValueOnce(teardown.promise);
    connection.change.mockRejectedValueOnce(
      new TransportError('Acceptance uncertain.'),
    );
    const first = session.add(crypto(), listener());
    await vi.advanceTimersByTimeAsync(20);
    const joining = session.add(crypto('ethusd'), listener());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(connection.open).toHaveBeenCalledOnce();
    teardown.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.all([first, joining]);
    expect(connection.open).toHaveBeenCalledTimes(2);
  });

  it('reopens after a disconnect in the final-key idle grace period', async () => {
    const harness = setup();
    const { session, connection } = harness;
    const observer = await accept(session);
    session.remove('btcusd', observer);
    harness.events.disconnected({ code: 4002, reason: 'Slow consumer.' });
    await accept(session, crypto('ethusd'));
    expect(connection.open).toHaveBeenCalledTimes(2);
  });

  it('waits for removal acceptance before adding the same key again', async () => {
    const { session, connection } = setup();
    const observer = await accept(session);
    const removal = Promise.withResolvers<PriceSubscriptionRejection[]>();
    connection.change.mockReturnValueOnce(removal.promise);
    session.remove('btcusd', observer);
    await vi.advanceTimersByTimeAsync(20);
    const joining = session.add(crypto(), listener());
    await vi.advanceTimersByTimeAsync(20);
    expect(connection.change).toHaveBeenCalledTimes(2);
    removal.resolve([]);
    await vi.advanceTimersByTimeAsync(20);
    await joining;
    expect(connection.change).toHaveBeenCalledTimes(3);
    expect(connection.change).toHaveBeenLastCalledWith(
      PriceSubscriptionOperation.Subscribe,
      [crypto()],
    );
  });

  it('reduces capacity on drops without resubscribing and restores it after quiet recovery', async () => {
    const harness = setup();
    const { session, connection } = harness;
    await accept(session);
    harness.events.dropped();
    expect(session.keyTarget).toBe(32);
    harness.events.dropped();
    expect(session.keyTarget).toBe(32);
    await vi.advanceTimersByTimeAsync(5_001);
    harness.events.dropped();
    expect(session.keyTarget).toBe(16);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(session.keyTarget).toBe(64);
    expect(connection.change).toHaveBeenCalledOnce();
  });

  it('preserves backoff and waits for authorization before accepting shared joiners', async () => {
    const harness = setup();
    const { session, connection } = harness;
    await accept(session);
    const authorization = Promise.withResolvers<void>();
    connection.authorize.mockReturnValueOnce(authorization.promise);
    harness.events.disconnected({ code: 4002, reason: 'Slow consumer.' });
    let accepted = false;
    const first = session.add(crypto(), listener()).then(() => {
      accepted = true;
    });
    await vi.advanceTimersByTimeAsync(400);
    expect(connection.open).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(200);
    const second = session.add(crypto(), listener());
    expect(accepted).toBe(false);
    expect(connection.authorize).toHaveBeenCalledTimes(2);
    authorization.resolve();
    await vi.advanceTimersByTimeAsync(20);
    await Promise.all([first, second]);
    expect(accepted).toBe(true);
  });

  it.each([
    4001, 4008,
  ])('ends every listener without retrying terminal close %i', async (code) => {
    const harness = setup();
    const { session, connection } = harness;
    const observer = await accept(session);
    harness.events.disconnected({ code, reason: 'Terminal.' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(observer.end).toHaveBeenCalledWith(expect.any(ConnectionLostError));
    expect(connection.open).toHaveBeenCalledOnce();
    expect(session.closed).toBe(true);
  });

  it('treats invalid authorization as terminal but retries temporary unavailability', async () => {
    const terminal = setup();
    terminal.connection.authorize.mockRejectedValueOnce(
      new RequestRejectedError('Realtime request rejected.', {
        status: 200,
        code: RealtimeKnownErrorCode.AuthInvalid,
      }),
    );
    await expect(
      terminal.session.add(crypto(), listener()),
    ).rejects.toBeInstanceOf(RequestRejectedError);
    expect(terminal.session.closed).toBe(true);
    const temporary = setup();
    temporary.connection.authorize.mockRejectedValueOnce(
      new RequestRejectedError('Realtime request rejected.', {
        status: 200,
        code: RealtimeKnownErrorCode.AuthUnavailable,
      }),
    );
    const pending = temporary.session.add(crypto(), listener());
    await vi.advanceTimersByTimeAsync(1_000);
    await pending;
    expect(temporary.connection.open).toHaveBeenCalledTimes(2);
  });

  it('initializes a late joiner with current history and excludes expired points', async () => {
    const harness = setup();
    const { session } = harness;
    await accept(session);
    harness.events.event(price(Date.now() - 120_001));
    harness.events.event(price(Date.now() - 10));
    harness.events.event(price());
    const joining = await accept(session);
    expect(joining.event).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'subscribe',
        payload: {
          symbol: 'btcusd',
          source: 'pyth',
          data: [
            { timestamp: Date.now() - 30, value: '1' },
            { timestamp: Date.now() - 20, value: '1' },
          ],
        },
      }),
    );
  });

  it('routes mixed-case equity TWAP updates and replays fixed-window snapshots', async () => {
    const harness = setup();
    const key: PriceKey = {
      key: 'equity-twap',
      topic: 'prices.equity.twap',
      symbol: 'usdjpy',
      windowSeconds: 60,
    };
    const observer = await accept(harness.session, key);
    const event = equityTwap();
    harness.events.event(event);
    expect(observer.event).toHaveBeenCalledWith(event);
    const joining = await accept(harness.session, key);
    expect(joining.event).toHaveBeenCalledWith({
      ...event,
      type: 'subscribe',
      payload: {
        symbol: 'USDJPY',
        source: 'chainlink',
        windowSeconds: 60,
        data: [{ timestamp: event.timestamp, value: '150.01' }],
      },
    });
  });

  it.each([
    false,
    true,
  ])('keeps replayed history within its current source (equity TWAP: %s)', async (twap) => {
    const harness = setup();
    const key: PriceKey = twap
      ? {
          key: 'equity-twap',
          topic: 'prices.equity.twap',
          symbol: 'usdjpy',
          windowSeconds: 60,
        }
      : crypto();
    await accept(harness.session, key);
    const eventFor = twap ? equityTwap : price;
    const timestamp = Date.now();
    // Source changes take priority over the within-source timestamp guard.
    for (const [source, offset] of [
      ['newer_vendor', 1],
      ['equal_vendor', 0],
      ['older_vendor', -1],
    ] as const) {
      harness.events.event(eventFor(timestamp - 10));
      harness.events.event(eventFor(timestamp));
      harness.events.event(eventFor(timestamp + offset, source));
      const joining = await accept(harness.session, key);
      const expected = expect.objectContaining({
        type: 'subscribe',
        payload: expect.objectContaining({
          source,
          data: [
            { timestamp: timestamp + offset, value: twap ? '150.01' : '1' },
          ],
        }),
      });
      expect(joining.event).toHaveBeenCalledWith(expected);
      harness.events.event(eventFor(timestamp - 20, source));
      const later = await accept(harness.session, key);
      expect(later.event).toHaveBeenCalledWith(expected);
    }
  });

  it('confirms a listener added during a callback only once', async () => {
    const harness = setup();
    const subscription = crypto();
    const joining = { ...listener(), subscribed: vi.fn() };
    const first = {
      ...listener(),
      subscribed: vi.fn(() => {
        void harness.session.add(crypto(), joining);
      }),
    };
    await accept(harness.session, subscription, first);
    harness.events.subscribed(subscription, {
      symbol: 'btcusd',
      provider: KnownPriceSource.Pyth,
    });
    expect(first.subscribed).toHaveBeenCalledTimes(1);
    expect(joining.subscribed).toHaveBeenCalledExactlyOnceWith({
      symbol: 'btcusd',
      provider: KnownPriceSource.Pyth,
    });
  });

  it('replays provider confirmation to late listeners and clears it on reconnect', async () => {
    const harness = setup();
    const subscription = crypto();
    const first = { ...listener(), subscribed: vi.fn() };
    await accept(harness.session, subscription, first);
    harness.events.subscribed(subscription, {
      symbol: 'btcusd',
      provider: KnownPriceSource.Pyth,
    });
    expect(first.subscribed).toHaveBeenCalledWith({
      symbol: 'btcusd',
      provider: KnownPriceSource.Pyth,
    });
    const joining = { ...listener(), subscribed: vi.fn() };
    await accept(harness.session, crypto(), joining);
    expect(joining.subscribed).toHaveBeenCalledWith({
      symbol: 'btcusd',
      provider: KnownPriceSource.Pyth,
    });
    harness.events.disconnected({ code: 4002, reason: 'Slow consumer.' });
    await vi.advanceTimersByTimeAsync(800);
    const afterReconnect = { ...listener(), subscribed: vi.fn() };
    await accept(harness.session, crypto(), afterReconnect);
    expect(afterReconnect.subscribed).not.toHaveBeenCalled();
    harness.events.subscribed(subscription, { symbol: 'btcusd' });
    expect(afterReconnect.subscribed).toHaveBeenCalledWith({
      symbol: 'btcusd',
    });
  });

  it('does not confirm a replacement with the removed subscription acknowledgement', async () => {
    const harness = setup();
    const original = crypto();
    const first = await accept(harness.session, original);
    harness.session.remove(original.key, first);
    const replacement = crypto();
    const joining = { ...listener(), subscribed: vi.fn() };
    const pending = harness.session.add(replacement, joining);
    harness.events.subscribed(original, {
      symbol: 'btcusd',
      provider: KnownPriceSource.Pyth,
    });
    expect(joining.subscribed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(40);
    await pending;
    harness.events.subscribed(replacement, {
      symbol: 'btcusd',
      provider: KnownPriceSource.Chainlink,
    });
    expect(joining.subscribed).toHaveBeenCalledExactlyOnceWith({
      symbol: 'btcusd',
      provider: KnownPriceSource.Chainlink,
    });
  });
});
