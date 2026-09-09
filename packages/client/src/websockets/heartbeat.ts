import { setNonBlockingInterval } from '@polymarket/types';
import type { WebSocketHeartbeat } from './lifecycle';

const CLOB_HEARTBEAT_INTERVAL_MS = 10_000;
const CLOB_HEARTBEAT_STALE_MS = 30_000;
const SPORTS_HEARTBEAT_STALE_MS = 30_000;
const PERPS_HEARTBEAT_INTERVAL_MS = 25_000;
const PERPS_HEARTBEAT_STALE_MS = 65_000;

export class ClobWebSocketHeartbeat implements WebSocketHeartbeat {
  #lastPongAt = 0;
  #timer: ReturnType<typeof setInterval> | undefined;

  start(send: (message: string) => void): void {
    this.stop();
    this.#lastPongAt = Date.now();
    this.#timer = setNonBlockingInterval(() => {
      send('PING');
    }, CLOB_HEARTBEAT_INTERVAL_MS);
  }

  handleMessage(message: string): boolean {
    if (message !== 'PONG') return false;
    this.#lastPongAt = Date.now();
    return true;
  }

  isStale(now: number): boolean {
    return now - this.#lastPongAt > CLOB_HEARTBEAT_STALE_MS;
  }

  stop(): void {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }
}

export class SportsWebSocketHeartbeat implements WebSocketHeartbeat {
  #lastPingAt = 0;
  #send: ((message: string) => void) | undefined;

  start(send: (message: string) => void): void {
    this.#lastPingAt = Date.now();
    this.#send = send;
  }

  stop(): void {
    this.#send = undefined;
  }

  handleMessage(message: string): boolean {
    if (message !== 'ping') return false;
    this.#lastPingAt = Date.now();
    this.#send?.('pong');
    return true;
  }

  isStale(now: number): boolean {
    return now - this.#lastPingAt > SPORTS_HEARTBEAT_STALE_MS;
  }
}

export class PerpsWebSocketHeartbeat implements WebSocketHeartbeat {
  #lastMessageAt = 0;
  #timer: ReturnType<typeof setInterval> | undefined;

  start(send: (message: string) => void): void {
    this.stop();
    this.#lastMessageAt = Date.now();
    this.#timer = setNonBlockingInterval(() => {
      send(JSON.stringify({ id: 0, req: 'post', op: { type: 'ping' } }));
    }, PERPS_HEARTBEAT_INTERVAL_MS);
  }

  handleMessage(): boolean {
    this.#lastMessageAt = Date.now();
    return false;
  }

  isStale(now: number): boolean {
    return now - this.#lastMessageAt > PERPS_HEARTBEAT_STALE_MS;
  }

  stop(): void {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }
}

export class PolyboltWebSocketHeartbeat implements WebSocketHeartbeat {
  #lastMessageAt = 0;
  #timer: ReturnType<typeof setInterval> | undefined;
  start(send: (message: string) => void): void {
    this.stop();
    this.#lastMessageAt = Date.now();
    this.#timer = setNonBlockingInterval(() => send('{"op":"ping"}'), 30_000);
  }
  handleMessage(_message: string): boolean {
    this.#lastMessageAt = Date.now();
    return false;
  }
  isStale(now: number): boolean {
    return now - this.#lastMessageAt >= 90_000;
  }
  stop(): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
  }
}
