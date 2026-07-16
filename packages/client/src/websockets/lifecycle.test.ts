import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketConnection } from './lifecycle';

describe('WebSocketConnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes configured headers to the WebSocket constructor', async () => {
    const constructions: Array<{ options: unknown; url: string }> = [];

    class HeaderWebSocket extends EventTarget {
      static OPEN = 1;
      static CLOSED = 3;
      static CLOSING = 2;

      readyState = 0;

      constructor(url: string, options?: unknown) {
        super();
        constructions.push({ options, url });

        queueMicrotask(() => {
          this.readyState = HeaderWebSocket.OPEN;
          this.dispatchEvent(new Event('open'));
        });
      }

      send(): void {}

      close(): void {
        this.readyState = HeaderWebSocket.CLOSED;
        this.dispatchEvent(new Event('close'));
      }
    }

    vi.stubGlobal('WebSocket', HeaderWebSocket);
    const connection = new WebSocketConnection();

    await connection.connect({
      headers: { 'x-preprod-access': 'token' },
      onConnectionLost: () => undefined,
      onError: () => undefined,
      onMessage: () => undefined,
      onOpen: () => undefined,
      url: 'wss://example.test/rfq',
    });

    expect(constructions).toEqual([
      {
        options: { headers: { 'x-preprod-access': 'token' } },
        url: 'wss://example.test/rfq',
      },
    ]);

    await connection.close();
  });
});
