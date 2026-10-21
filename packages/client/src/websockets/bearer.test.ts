import type { BearerCredentials } from '@polymarket/bindings';
import { WalletType } from '@polymarket/bindings/gamma';
import { expectEvmAddress } from '@polymarket/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthSession } from '../session';
import { SignerType } from '../wallet';
import { ClobUserWebSocketManager } from './clob/user';
import { PolyboltConnection } from './realtime/socket';
import { RfqQuoterWebSocketManager } from './rfq/quoter';

const address = expectEvmAddress('0x0000000000000000000000000000000000000001');
function pair(sequence = 0): BearerCredentials {
  return {
    accessToken: `test.${btoa(JSON.stringify({ sub: address, client_id: 'synthetic-client', wallet: address, signature_type: 0, clob_api_key: 'synthetic-key', exp: Math.floor(Date.now() / 1000) + 900, jti: sequence }))}.test`,
    refreshToken: `synthetic-refresh-${sequence}`,
  };
}
type Frame = { op?: string; type?: string; rid?: string; auth?: object };
class ControlledSocket extends EventTarget {
  static OPEN = 1;
  static CLOSED = 3;
  static CLOSING = 2;
  static sockets: ControlledSocket[] = [];
  static accept = true;
  readyState = 0;
  frames: Frame[] = [];
  constructor() {
    super();
    ControlledSocket.sockets.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event('open'));
    });
  }
  send(data: string) {
    if (data === 'PING') {
      this.dispatchEvent(new MessageEvent('message', { data: 'PONG' }));
      return;
    }
    const frame: Frame = JSON.parse(data);
    this.frames.push(frame);
    if (!ControlledSocket.accept) return;
    if (frame.op === 'auth') this.receive({ op: 'authed', rid: frame.rid });
    else if (frame.type === 'auth')
      this.receive({ type: 'auth', success: true });
  }
  receive(frame: object) {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(frame) }),
    );
  }
  close() {
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
  disconnect(code = 1008, reason = 'authentication expired') {
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent('close', { code, reason }));
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', ControlledSocket);
  ControlledSocket.sockets = [];
  ControlledSocket.accept = true;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('bearer socket boundaries', () => {
  it('CLOB subscribes with accessToken only, renews without resubscribing, and reconnects with current credentials', async () => {
    const original = pair();
    const replacement = pair(1);
    const session = new AuthSession({
      credentials: original,
      refresh: async () => replacement,
    });
    const manager = new ClobUserWebSocketManager({
      session,
      url: 'wss://synthetic.invalid/user',
    });
    const handle = await manager.subscribe({ topic: 'user' });
    const socket = ControlledSocket.sockets[0];
    expect(socket?.frames).toEqual([
      { type: 'user', auth: { accessToken: original.accessToken } },
    ]);
    await session.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(socket?.frames).toEqual([
      { type: 'user', auth: { accessToken: original.accessToken } },
      { type: 'auth', auth: { accessToken: replacement.accessToken } },
    ]);
    socket?.disconnect();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ControlledSocket.sockets[1]?.frames).toEqual([
      { type: 'user', auth: { accessToken: replacement.accessToken } },
    ]);
    expect(
      JSON.stringify(ControlledSocket.sockets.map((s) => s.frames)),
    ).not.toContain('refresh');
    await handle.close();
    session.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Polybolt requires its matching fresh rid and keeps subscriptions alive on non-closing rejection', async () => {
    const original = pair();
    const replacement = pair(1);
    const session = new AuthSession({
      credentials: original,
      refresh: async () => replacement,
    });
    const failed = vi.fn();
    const connection = new PolyboltConnection({
      session,
      url: 'wss://synthetic.invalid/prices',
    });
    await connection.open({
      subscribed: vi.fn(),
      event: vi.fn(),
      dropped: vi.fn(),
      disconnected: vi.fn(),
      failed,
    });
    const initial = connection.authorize();
    await vi.advanceTimersByTimeAsync(110);
    await initial;
    const socket = ControlledSocket.sockets[0];
    ControlledSocket.accept = false;
    await session.refresh();
    await vi.advanceTimersByTimeAsync(110);
    const renewal = socket?.frames.at(-1);
    expect(renewal).toMatchObject({
      op: 'auth',
      auth: { accessToken: replacement.accessToken },
    });
    expect(renewal?.rid).not.toBe(socket?.frames[0]?.rid);
    socket?.receive({ op: 'authed', rid: 'wrong-rid' });
    socket?.receive({ op: 'error', code: 'auth_invalid', rid: renewal?.rid });
    await vi.advanceTimersByTimeAsync(0);
    expect(socket?.readyState).toBe(1);
    expect(failed).not.toHaveBeenCalled();
    expect(JSON.stringify(socket?.frames)).not.toContain('refresh');
    await connection.close();
    session.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Combos sends no CLOB API-key credentials, renews on the same connection, and cleans up', async () => {
    const session = new AuthSession({
      credentials: pair(),
      refresh: async () => pair(1),
    });
    const manager = new RfqQuoterWebSocketManager({
      session,
      url: 'wss://synthetic.invalid/maker',
      account: {
        signer: address,
        wallet: address,
        signerType: SignerType.OWNER,
        walletType: WalletType.EOA,
      },
      chainId: 137,
      exchange: address,
      signer: {
        getAddress: async () => address,
        signTypedData: vi.fn(),
        signMessage: vi.fn(),
        sendTransaction: vi.fn(),
      },
    });
    const rfq = await manager.connect();
    await session.refresh();
    await vi.advanceTimersByTimeAsync(0);
    const frames = ControlledSocket.sockets[0]?.frames;
    expect(frames).toEqual([
      { type: 'auth', auth: { accessToken: pair().accessToken } },
      { type: 'auth', auth: { accessToken: pair(1).accessToken } },
    ]);
    expect(JSON.stringify(frames)).not.toContain('refresh');
    await rfq.close();
    await manager.shutdown();
    session.close();
    expect(vi.getTimerCount()).toBe(0);
  });
});

it('keeps the CLOB handle across idle expiry after rejected renewal', async () => {
  const old = pair();
  const claims = JSON.parse(atob(old.accessToken.split('.')[1] ?? ''));
  const expiring = {
    ...old,
    accessToken: `test.${btoa(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + 60 }))}.test`,
  };
  const replacement = pair(1);
  const session = new AuthSession({
    credentials: expiring,
    refresh: async () => replacement,
  });
  const manager = new ClobUserWebSocketManager({
    session,
    url: 'wss://synthetic.invalid/user',
  });
  const handle = await manager.subscribe({ topic: 'user' });
  ControlledSocket.accept = false;
  await session.refresh();
  ControlledSocket.sockets[0]?.receive({ type: 'auth', success: false });
  await vi.advanceTimersByTimeAsync(0);
  ControlledSocket.accept = true;
  await vi.advanceTimersByTimeAsync(91_000);
  expect(ControlledSocket.sockets).toHaveLength(2);
  expect(ControlledSocket.sockets[1]?.frames).toEqual([
    { type: 'user', auth: { accessToken: replacement.accessToken } },
  ]);
  await handle.close();
  session.close();
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps maker public feeds after rejection and blocks quotes before wallet signing', async () => {
  const session = new AuthSession({
    credentials: pair(),
    refresh: async () => pair(1),
  });
  const signTypedData = vi.fn();
  const manager = new RfqQuoterWebSocketManager({
    session,
    url: 'wss://synthetic.invalid/maker',
    account: {
      signer: address,
      wallet: address,
      signerType: SignerType.OWNER,
      walletType: WalletType.EOA,
    },
    chainId: 137,
    exchange: address,
    signer: {
      getAddress: async () => address,
      signTypedData,
      signMessage: vi.fn(),
      sendTransaction: vi.fn(),
    },
  });
  ControlledSocket.accept = false;
  const connecting = manager.connect();
  await vi.advanceTimersByTimeAsync(0);
  const socket = ControlledSocket.sockets[0];
  socket?.receive({ type: 'auth', success: false, error: 'auth_invalid' });
  const rfq = await connecting;
  expect(socket?.readyState).toBe(1);
  socket?.receive({
    type: 'RFQ_REQUEST',
    rfq_id: '00000000-0000-4000-8000-000000000001',
    requestor_public_id: 'synthetic-requester',
    leg_position_ids: ['1'],
    condition_id: `0x03${'0'.repeat(60)}`,
    yes_position_id: '1',
    no_position_id: '2',
    direction: 'BUY',
    side: 'YES',
    requested_size: { unit: 'shares', value_e6: '1000000' },
    submission_deadline: Date.now() + 60_000,
  });
  for await (const event of rfq) {
    if (event.type !== 'quote_request') continue;
    await expect(event.quote({ price: '0.5' })).rejects.toMatchObject({
      name: 'RequestRejectedError',
    });
    break;
  }
  expect(signTypedData).not.toHaveBeenCalled();
  await manager.shutdown();
  session.close();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  'close',
  'disconnect',
])('Polybolt ignores an initial ACK invalidated by %s before its continuation', async (stop) => {
  const session = new AuthSession({
    credentials: pair(),
    refresh: async () => pair(1),
  });
  const changes = vi.spyOn(session, 'onChange');
  const connection = new PolyboltConnection({
    session,
    url: 'wss://synthetic.invalid/prices',
  });
  await connection.open({
    subscribed: vi.fn(),
    event: vi.fn(),
    dropped: vi.fn(),
    disconnected: vi.fn(),
    failed: vi.fn(),
  });
  ControlledSocket.accept = false;
  const authorized = connection.authorize();
  const rejected = expect(authorized).rejects.toMatchObject({
    name: 'TransportError',
  });
  await vi.advanceTimersByTimeAsync(110);
  const socket = ControlledSocket.sockets[0];
  socket?.receive({ op: 'authed', rid: socket.frames[0]?.rid });
  const closing = stop === 'close' ? connection.close() : undefined;
  if (stop === 'disconnect') socket?.disconnect(1006, 'lost');
  try {
    await rejected;
    await closing;
    expect(changes).not.toHaveBeenCalled();
    await connection.close();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    await connection.close();
    session.close();
  }
});

it.each([
  'shutdown',
  'disconnect',
])('RFQ ignores an initial ACK invalidated by %s before its continuation', async (stop) => {
  const session = new AuthSession({
    credentials: pair(),
    refresh: async () => pair(1),
  });
  const changes = vi.spyOn(session, 'onChange');
  const manager = new RfqQuoterWebSocketManager({
    session,
    url: 'wss://synthetic.invalid/maker',
    account: {
      signer: address,
      wallet: address,
      signerType: SignerType.OWNER,
      walletType: WalletType.EOA,
    },
    chainId: 137,
    exchange: address,
    signer: {
      getAddress: async () => address,
      signTypedData: vi.fn(),
      signMessage: vi.fn(),
      sendTransaction: vi.fn(),
    },
  });
  ControlledSocket.accept = false;
  const connecting = manager.connect();
  const rejected = expect(connecting).rejects.toMatchObject({
    name: 'TransportError',
  });
  await vi.advanceTimersByTimeAsync(0);
  const socket = ControlledSocket.sockets[0];
  socket?.receive({ type: 'auth', success: true });
  const closing = stop === 'shutdown' ? manager.shutdown() : undefined;
  if (stop === 'disconnect') socket?.disconnect(1006, 'lost');
  try {
    await rejected;
    await closing;
    expect(changes).not.toHaveBeenCalled();
    await manager.shutdown();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    await manager.shutdown();
    session.close();
  }
});
