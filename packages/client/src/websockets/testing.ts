import type { WebSocketLink } from 'msw';
import type { SetupServerApi } from 'msw/node';
import { expect, vi } from 'vitest';

export type CapturedConnection = {
  close(): Promise<void>;
  send(data: unknown): Promise<void>;
};

export function collectFrames(
  server: SetupServerApi,
  link: WebSocketLink,
): unknown[] {
  const frames: unknown[] = [];

  server.use(
    link.addEventListener('connection', ({ client }) => {
      client.addEventListener('message', (event) => {
        frames.push(JSON.parse(String(event.data)));
      });
    }),
  );

  return frames;
}

export function captureConnection(
  server: SetupServerApi,
  link: WebSocketLink,
): CapturedConnection {
  let clientConnection:
    | { close: () => void; send: (data: string) => void }
    | undefined;

  server.use(
    link.addEventListener('connection', ({ client }) => {
      clientConnection = client;
    }),
  );

  async function getClient(): Promise<NonNullable<typeof clientConnection>> {
    await vi.waitFor(() => {
      expect(clientConnection).toBeDefined();
    });
    if (clientConnection === undefined) {
      throw new Error('Expected websocket connection.');
    }
    return clientConnection;
  }

  return {
    async close() {
      const client = await getClient();
      client.close();
    },
    async send(data) {
      const client = await getClient();
      client.send(JSON.stringify(data));
    },
  };
}

export function waitForNextEvent<TEvent>(
  handle: AsyncIterable<TEvent>,
): Promise<IteratorResult<TEvent>> {
  return handle[Symbol.asyncIterator]().next();
}

export type ExpectDropsUnknownFrameOptions<TEvent> = {
  /**
   * Frames sent before the unknown frame that the stream treats as expected
   * control frames (for example request acknowledgements); like unknown
   * frames, they must not produce events.
   */
  expectedControlFrames?: unknown[];
  /** `toMatchObject` matcher for the event produced by `validFrame`. */
  expectedEvent: unknown;
  link: WebSocketLink;
  server: SetupServerApi;
  /**
   * Opens the stream under test and returns its event iterable plus a
   * cleanup callback.
   */
  subscribe: () => Promise<{
    close: () => Promise<void>;
    events: AsyncIterable<TEvent>;
  }>;
  unknownFrame: unknown;
  validFrame: unknown;
};

/**
 * Asserts the shared unknown-frame contract for a websocket stream: an
 * unrecognized frame is dropped without emitting an event, and the connection
 * and subscription survive — proven by the valid frame sent afterwards being
 * delivered as the next event.
 */
export async function expectDropsUnknownFrame<TEvent>(
  options: ExpectDropsUnknownFrameOptions<TEvent>,
): Promise<void> {
  const connection = captureConnection(options.server, options.link);
  const { close, events } = await options.subscribe();

  try {
    const next = waitForNextEvent(events);

    for (const frame of options.expectedControlFrames ?? []) {
      await connection.send(frame);
    }
    await connection.send(options.unknownFrame);
    await connection.send(options.validFrame);

    await expect(next).resolves.toMatchObject({
      done: false,
      value: options.expectedEvent,
    });
  } finally {
    await close();
  }
}
