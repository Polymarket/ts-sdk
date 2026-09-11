import { describe, expect, it } from 'vitest';
import {
  CryptoPricesChainlinkTwapEventSchema,
  RealtimeEventSchema,
} from './rtds';

const observationTimestamp = 1_772_752_581_815;
const publicationTimestamp = 1_772_752_582_004;

const rawTwapEvent = {
  connection_id: 'connection-1234567890',
  type: 'update',
  timestamp: publicationTimestamp,
  payload: {
    symbol: 'btc/usd',
    value: 65_000.5,
    full_accuracy_value: '65000500000000000000000',
    timestamp: observationTimestamp,
  },
} as const;

describe('CryptoPricesChainlinkTwapEventSchema', () => {
  it.each([
    ['crypto_prices_twap_thirty', 30],
    ['crypto_prices_twap_sixty', 60],
  ] as const)('normalizes the %s wire topic and its window', (rawTopic, windowSeconds) => {
    const parsed = RealtimeEventSchema.parse({
      ...rawTwapEvent,
      topic: rawTopic,
      payload: {
        ...rawTwapEvent.payload,
        window_s: windowSeconds,
      },
    });

    expect(parsed).toEqual({
      topic: 'prices.crypto.chainlink.twap',
      type: 'update',
      timestamp: publicationTimestamp,
      payload: {
        symbol: 'btc/usd',
        value: '65000.5',
        timestamp: observationTimestamp,
        windowSeconds,
      },
    });
  });

  it.each([
    ['crypto_prices_twap_thirty', 60],
    ['crypto_prices_twap_sixty', 30],
  ] as const)('rejects a %s frame whose payload claims window %i', (rawTopic, windowSeconds) => {
    const parsed = CryptoPricesChainlinkTwapEventSchema.safeParse({
      ...rawTwapEvent,
      topic: rawTopic,
      payload: {
        ...rawTwapEvent.payload,
        window_s: windowSeconds,
      },
    });

    expect(parsed.success).toBe(false);
  });

  it('normalizes the exact E18 value instead of the rounded display float', () => {
    const parsed = CryptoPricesChainlinkTwapEventSchema.safeParse({
      ...rawTwapEvent,
      topic: 'crypto_prices_twap_thirty',
      payload: {
        ...rawTwapEvent.payload,
        value: 65_000.12345678901,
        full_accuracy_value: '65000123456789012345678',
        window_s: 30,
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.payload.value).toBe('65000.123456789012345678');
    }
  });

  it.each([
    ['0', '0'],
    ['1', '0.000000000000000001'],
    ['-1', '-0.000000000000000001'],
    ['1000000000000000000', '1'],
    ['-1000000000000000000', '-1'],
    ['1230000000000000000', '1.23'],
  ] as const)('normalizes the E18 boundary value %s', (rawValue, expected) => {
    const parsed = CryptoPricesChainlinkTwapEventSchema.parse({
      ...rawTwapEvent,
      topic: 'crypto_prices_twap_thirty',
      payload: {
        ...rawTwapEvent.payload,
        full_accuracy_value: rawValue,
        window_s: 30,
      },
    });

    expect(parsed.payload.value).toBe(expected);
  });

  it('rejects a frame without the exact price', () => {
    const { full_accuracy_value: _, ...payload } = rawTwapEvent.payload;
    const parsed = CryptoPricesChainlinkTwapEventSchema.safeParse({
      ...rawTwapEvent,
      topic: 'crypto_prices_twap_thirty',
      payload: { ...payload, window_s: 30 },
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects a non-integer exact price without throwing', () => {
    const parsed = CryptoPricesChainlinkTwapEventSchema.safeParse({
      ...rawTwapEvent,
      topic: 'crypto_prices_twap_thirty',
      payload: {
        ...rawTwapEvent.payload,
        full_accuracy_value: '1.2',
        window_s: 30,
      },
    });

    expect(parsed.success).toBe(false);
  });
});
