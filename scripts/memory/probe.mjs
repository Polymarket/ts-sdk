// Shared fresh-process probe. No SDK/dev loader; entry resolves in the installed consumer.

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const [consumer, entry = '-', mode = 'import', format = 'esm', profilePrefix] =
  process.argv.slice(2);
const requireConsumer = createRequire(`${consumer}/package.json`);
const resolver = await import(`${consumer}/resolve.mjs`);
let blockedFetches = 0;
let blockedSockets = 0;
globalThis.fetch = async () => {
  blockedFetches++;
  throw new Error('NETWORK DISABLED FOR OFFLINE BENCHMARK');
};
globalThis.WebSocket = class {
  constructor() {
    blockedSockets++;
    throw new Error('SOCKET DISABLED FOR OFFLINE BENCHMARK');
  }
};
async function collect() {
  for (let i = 0; i < 3; i++) {
    global.gc();
    await new Promise(setImmediate);
  }
  return process.memoryUsage();
}
const before = await collect();
const start = performance.now();
const cpuStart = process.cpuUsage();
const sdk =
  entry === '-'
    ? null
    : format === 'require'
      ? requireConsumer(entry)
      : await import(resolver.resolve(entry));
globalThis.retainedSdk = sdk;
const importMs = performance.now() - start;
const importCpu = process.cpuUsage(cpuStart);
const afterImportRaw = process.memoryUsage();
const afterImport = await collect();
const phases = { before, afterImportRaw, afterImport };
const timings = { importMs, importCpu };
const outputs = {};
if (mode === 'construct' || mode === 'offline' || mode === 'schema') {
  const t = performance.now();
  globalThis.retainedClient = sdk.createPublicClient();
  timings.constructMs = performance.now() - t;
  phases.afterConstructRaw = process.memoryUsage();
  phases.afterConstruct = await collect();
  outputs.publicClient = globalThis.retainedClient.isPublicClient();
}
if (mode === 'offline' || mode === 'schema') {
  const t = performance.now();
  const zero = '0x0000000000000000000000000000000000000000';
  outputs.approval = sdk.erc20ApprovalCall(zero, zero, 1n);
  try {
    sdk.erc20ApprovalCall(zero, zero, -1n);
    outputs.validation = false;
  } catch (e) {
    outputs.validation = e instanceof sdk.UserInputError;
  }
  outputs.hmac = await sdk.buildHmacSignature('dGVzdA==', 1, 'GET', '/offline');
  timings.offlineMs = performance.now() - t;
  phases.afterOfflineRaw = process.memoryUsage();
  phases.afterOffline = await collect();
}
if (mode === 'schema') {
  const gamma = await import(resolver.resolve('@polymarket/bindings/gamma'));
  const clob = await import(resolver.resolve('@polymarket/bindings/clob'));
  const data = await import(resolver.resolve('@polymarket/bindings/data'));
  const market = {
    id: '1',
    outcomes: '["Yes", "No"]',
    outcomePrices: '["0.4", "0.6"]',
  };
  const book = {
    market: `0x${'ab'.repeat(32)}`,
    asset_id: '111',
    bids: [],
    asks: [],
    min_order_size: '5',
    tick_size: '0.01',
    neg_risk: false,
    hash: 'a'.repeat(40),
  };
  const portfolio = {
    data: { proxy_wallet: `0x${'1'.repeat(40)}`, value: 12.3456 },
  };
  function parse() {
    globalThis.retainedParsed = [
      gamma.MarketSchema.parse(market),
      clob.OrderBookSchema.parse(book),
      data.FetchPortfolioValueResponseSchema.parse(portfolio),
    ];
  }
  let t = performance.now();
  parse();
  timings.firstSchemaMs = performance.now() - t;
  phases.afterFirstSchemaRaw = process.memoryUsage();
  phases.afterFirstSchema = await collect();
  t = performance.now();
  for (let i = 0; i < 1000; i++) parse();
  timings.schema1000Ms = performance.now() - t;
  outputs.schema = {
    yesPrice: globalThis.retainedParsed[0].outcomes.yes.price,
    tickSize: globalThis.retainedParsed[1].tickSize,
    value: globalThis.retainedParsed[2].value,
  };
  phases.afterSchema1000Raw = process.memoryUsage();
  phases.afterSchema1000 = await collect();
}
if (mode === 'snapshot') {
  const { writeHeapSnapshot } = await import('node:v8');
  writeHeapSnapshot(`${profilePrefix}.heapsnapshot`);
}
if (mode === 'exports') outputs.exports = Object.keys(sdk).sort();
const result = {
  entry,
  mode,
  format,
  node: process.version,
  phases,
  timings,
  outputs,
  maxRssKiB: process.resourceUsage().maxRSS,
  blockedFetches,
  blockedSockets,
  resources: process.getActiveResourcesInfo(),
};
if (profilePrefix)
  writeFileSync(`${profilePrefix}.json`, JSON.stringify(result));
process.stdout.write(`${JSON.stringify(result)}\n`);
