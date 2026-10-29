// Existing unit suites use local HTTP/WebSocket servers. Permit only loopback.
import net from 'node:net';
import tls from 'node:tls';

const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isLocalHost(host) {
  return localHosts.has(String(host).toLowerCase());
}

function denied(host) {
  return new Error(`External network disabled during offline tests: ${host}`);
}

function connectionHost(args) {
  const first = args[0];
  if (Array.isArray(first)) return connectionHost(first);
  if (typeof first === 'object' && first !== null) {
    if (first.path) return 'localhost';
    return first.host ?? 'localhost';
  }
  if (typeof first === 'string' && !/^\d+$/.test(first)) return 'localhost';
  return typeof args[1] === 'string' ? args[1] : 'localhost';
}

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const host = connectionHost(args);
  if (!isLocalHost(host)) {
    queueMicrotask(() => this.destroy(denied(host)));
    return this;
  }
  return Reflect.apply(connect, this, args);
};

const tlsConnect = tls.connect;
tls.connect = function (...args) {
  const host = connectionHost(args);
  if (!isLocalHost(host)) {
    const socket = new tls.TLSSocket(new net.Socket());
    queueMicrotask(() => socket.destroy(denied(host)));
    return socket;
  }
  return Reflect.apply(tlsConnect, this, args);
};

const fetch = globalThis.fetch;
globalThis.fetch = function (input, ...args) {
  const host = new URL(
    typeof input === 'string' || input instanceof URL ? input : input.url,
  ).hostname;
  if (!isLocalHost(host)) return Promise.reject(denied(host));
  return Reflect.apply(fetch, this, [input, ...args]);
};
