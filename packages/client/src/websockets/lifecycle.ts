import {
  setNonBlockingInterval,
  setNonBlockingTimeout,
} from '@polymarket/types';
import {
  TransportError,
  type WebSocketCloseCode,
  WebSocketKnownCloseCode,
} from '../errors';

export type WebSocketHeartbeat = {
  handleMessage(message: string): boolean;
  isStale(now: number): boolean;
  start(send: (message: string) => void): void;
  stop(): void;
};

const HEARTBEAT_WATCHDOG_INTERVAL_MS = 5_000;
const RECONNECT_BASE_DELAY_MS = 250;
const RECONNECT_MAX_DELAY_MS = 30_000;

export type ScheduleReconnectOptions = {
  shouldReconnect: () => boolean;
  reconnect: () => Promise<unknown>;
};

export type WebSocketCloseInfo = {
  code: WebSocketCloseCode;
  reason: string;
};

export type WebSocketConnectionOptions<TContext = undefined> = {
  headers?: Record<string, string>;
  onConnectionLost: (info: WebSocketCloseInfo) => void;
  onError: () => void;
  onMessage: (message: unknown) => void;
  onOpen: (context: TContext) => void;
  prepare?: () => TContext | Promise<TContext>;
  url: string;
};

export type WebSocketConnectionResult = {
  reusedOpenSocket: boolean;
};

export type WebSocketConnectionConstructorOptions = {
  heartbeat?: WebSocketHeartbeat;
};

export class ReconnectScheduler {
  #timer: ReturnType<typeof setTimeout> | undefined;
  #attempt = 0;

  schedule(options: ScheduleReconnectOptions): void {
    if (this.#timer !== undefined || !options.shouldReconnect()) {
      return;
    }

    const delay = reconnectDelay(this.#attempt, {
      baseMs: RECONNECT_BASE_DELAY_MS,
      maxMs: RECONNECT_MAX_DELAY_MS,
    });
    this.#attempt += 1;
    this.#timer = setNonBlockingTimeout(() => {
      this.#timer = undefined;
      void this.#reconnect(options);
    }, delay);
  }

  stop(): void {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  resetBackoff(): void {
    this.#attempt = 0;
    this.stop();
  }

  async #reconnect(options: ScheduleReconnectOptions): Promise<void> {
    if (!options.shouldReconnect()) return;
    try {
      await options.reconnect();
    } catch {
      this.schedule(options);
    }
  }
}

export class WebSocketConnection {
  readonly #heartbeat: WebSocketHeartbeat | undefined;
  #socket: WebSocket | undefined;
  #connecting: Promise<WebSocketConnectionResult> | undefined;
  #watchdog: ReturnType<typeof setInterval> | undefined;

  constructor(options: WebSocketConnectionConstructorOptions = {}) {
    this.#heartbeat = options.heartbeat;
  }

  connect<TContext = undefined>(
    options: WebSocketConnectionOptions<TContext>,
  ): Promise<WebSocketConnectionResult> {
    const socket = this.#socket;
    if (socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve({ reusedOpenSocket: true });
    }
    this.#clearCurrentSocket();
    if (this.#connecting !== undefined) return this.#connecting;

    const connecting = this.#open(options)
      .then(() => ({ reusedOpenSocket: false }))
      .catch((error: unknown) => {
        if (this.#connecting === connecting) {
          this.#connecting = undefined;
        }
        throw error;
      });
    this.#connecting = connecting;
    return connecting;
  }

  send(message: unknown): boolean {
    return this.#sendRaw(JSON.stringify(message));
  }

  #sendRaw(message: string): boolean {
    // Reconnects and shutdown can race with protocol updates; callers use the
    // boolean result only when they need to know whether the frame was sent.
    if (this.#socket?.readyState !== WebSocket.OPEN) return false;
    this.#socket.send(message);
    return true;
  }

  async close(): Promise<void> {
    const socket = await this.#takeCurrent();
    this.#stopHeartbeat();
    if (socket === undefined || socket.readyState === WebSocket.CLOSED) return;

    await new Promise<void>((resolve) => {
      socket.addEventListener('close', () => resolve(), { once: true });
      if (socket.readyState !== WebSocket.CLOSING) {
        socket.close();
      }
    });
  }

  async #open<TContext>(
    options: WebSocketConnectionOptions<TContext>,
  ): Promise<WebSocket> {
    const context = await options.prepare?.();

    return new Promise<WebSocket>((resolve, reject) => {
      const socket = createWebSocket(options.url, options.headers);

      const onOpen = () => {
        socket.removeEventListener('error', onOpenError);
        this.#markOpen(socket);
        this.#startHeartbeat();
        options.onOpen(context as TContext);
        resolve(socket);
      };
      const onOpenError = (event: Event) => {
        socket.removeEventListener('open', onOpen);
        reject(
          new TransportError(`WebSocket connection failed: ${options.url}`, {
            cause: event,
          }),
        );
      };

      socket.addEventListener('open', onOpen, { once: true });
      socket.addEventListener('error', onOpenError, { once: true });
      socket.addEventListener('message', (event) => {
        if (this.#socket !== socket) return;
        const message = String(event.data);
        if (this.#heartbeat?.handleMessage(message)) return;

        let raw: unknown;
        try {
          raw = JSON.parse(message);
        } catch {
          return;
        }
        options.onMessage(raw);
      });
      socket.addEventListener('close', (event) => {
        if (this.#socket !== socket) return;
        this.#clearCurrentSocket();
        options.onConnectionLost({
          code: event.code || WebSocketKnownCloseCode.NoStatusReceived,
          reason: event.reason ?? '',
        });
      });
      socket.addEventListener('error', () => options.onError());
    });
  }

  #markOpen(socket: WebSocket): void {
    this.#socket = socket;
    this.#connecting = undefined;
  }

  #clearCurrentSocket(): void {
    this.#stopHeartbeat();
    this.#socket = undefined;
  }

  #startHeartbeat(): void {
    this.#stopHeartbeat();
    const heartbeat = this.#heartbeat;
    if (heartbeat === undefined) return;

    heartbeat.start((message) => this.#sendRaw(message));
    this.#watchdog = setNonBlockingInterval(() => {
      if (!heartbeat.isStale(Date.now())) return;
      const socket = this.#socket;
      if (socket?.readyState === WebSocket.OPEN) {
        // Let the normal close path reconnect and resubscribe active handles.
        socket.close();
      }
    }, HEARTBEAT_WATCHDOG_INTERVAL_MS);
  }

  #stopHeartbeat(): void {
    if (this.#watchdog !== undefined) {
      clearInterval(this.#watchdog);
      this.#watchdog = undefined;
    }
    this.#heartbeat?.stop();
  }

  async #takeCurrent(): Promise<WebSocket | undefined> {
    const socket = this.#socket;
    const connecting = this.#connecting;

    this.#socket = undefined;
    this.#connecting = undefined;

    if (socket !== undefined) return socket;
    return connecting?.then(
      () => this.#socket,
      () => undefined,
    );
  }
}

function createWebSocket(
  url: string,
  headers: Record<string, string> | undefined,
): WebSocket {
  if (headers === undefined) return new WebSocket(url);

  try {
    const socket: unknown = Reflect.construct(WebSocket, [url, { headers }]);
    if (socket instanceof WebSocket) return socket;
  } catch (cause) {
    throw new TransportError(
      'WebSocket headers require a header-capable WebSocket implementation.',
      { cause },
    );
  }

  throw new TransportError(
    'WebSocket headers require a header-capable WebSocket implementation.',
  );
}

type ReconnectDelayOptions = {
  baseMs: number;
  maxMs: number;
};

function reconnectDelay(
  attempt: number,
  options: ReconnectDelayOptions,
): number {
  const exponentialDelay = Math.min(
    options.baseMs * 2 ** attempt,
    options.maxMs,
  );
  return Math.random() * exponentialDelay;
}
