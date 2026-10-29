import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { type as osType } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const [configFile, outPrefix, countArg = '15', warmupArg = '3', baselineFile] =
  process.argv.slice(2);
if (!configFile || !outPrefix)
  throw new Error(
    'Usage: node scripts/memory/benchmark.mjs CONFIG OUTPUT_PREFIX [REPLICATES=15] [WARMUPS=3] [BASELINE_JSON]',
  );
const cases = JSON.parse(readFileSync(configFile, 'utf8'));
for (const test of cases) test.consumer = resolve(test.consumer);
for (const consumer of new Set(cases.map((x) => x.consumer)))
  writeFileSync(
    `${consumer}/resolve.mjs`,
    'export function resolve(specifier) { return import.meta.resolve(specifier); }\n',
  );
const count = Number(countArg);
const warmup = Number(warmupArg);
if (
  !Number.isInteger(count) ||
  count < 1 ||
  !Number.isInteger(warmup) ||
  warmup < 0
) {
  throw new Error(
    'Replicates must be positive and warmups must be non-negative integers.',
  );
}
const baseline = baselineFile
  ? JSON.parse(readFileSync(baselineFile, 'utf8'))
  : null;
if (baseline) {
  const machine =
    process.arch === 'x64'
      ? 'x86_64'
      : process.arch === 'arm64'
        ? 'aarch64'
        : process.arch;
  if (
    process.version !== baseline.environment.node ||
    osType() !== baseline.environment.os ||
    machine !== baseline.environment.arch
  ) {
    throw new Error(
      'Baseline environment differs: record a new baseline before comparing.',
    );
  }
  if (
    count < baseline.method.replicates ||
    warmup < baseline.method.discardedWarmupRounds
  ) {
    throw new Error(
      'Baseline comparisons require at least the original replicate and warmup counts.',
    );
  }
}
const probe = fileURLToPath(new URL('./probe.mjs', import.meta.url));
let seed = 267105;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
}
function shuffle(arr) {
  return arr
    .map((x) => [random(), x])
    .sort((a, b) => a[0] - b[0])
    .map((x) => x[1]);
}
writeFileSync(`${outPrefix}.ndjson`, '');
for (let round = -warmup; round < count; round++) {
  for (const test of shuffle(cases)) {
    const t = performance.now();
    const p = spawnSync(
      process.execPath,
      [
        '--expose-gc',
        probe,
        test.consumer,
        test.entry ?? '-',
        test.mode ?? 'import',
        test.format ?? 'esm',
      ],
      { encoding: 'utf8', timeout: 60000 },
    );
    if (p.status !== 0)
      throw new Error(`${test.name}: ${p.stderr}\n${p.stdout}`);
    const result = {
      name: test.name,
      consumer: test.consumer,
      round,
      wallMs: performance.now() - t,
      ...JSON.parse(p.stdout),
    };
    if (result.blockedFetches || result.blockedSockets)
      throw new Error(`${test.name}: unexpected network attempt`);
    if (
      ['offline', 'schema'].includes(test.mode) &&
      (!result.outputs.publicClient ||
        !result.outputs.validation ||
        result.outputs.hmac !== 'XOQxvU9-ZJzQJkvFcNIHilnt9J5ENF_K4lyiXJe1yzw=')
    )
      throw new Error(`${test.name}: offline contract failure`);
    if (
      test.mode === 'schema' &&
      JSON.stringify(result.outputs.schema) !==
        JSON.stringify({ yesPrice: '0.4', tickSize: 0.01, value: '12.3456' })
    )
      throw new Error(`${test.name}: schema contract failure`);
    if (round >= 0)
      appendFileSync(`${outPrefix}.ndjson`, `${JSON.stringify(result)}\n`);
  }
  process.stderr.write(`round ${round + 1}/${count}\n`);
}
const rows = readFileSync(`${outPrefix}.ndjson`, 'utf8')
  .trim()
  .split('\n')
  .map(JSON.parse);
function quantile(a, p) {
  a.sort((x, y) => x - y);
  return a[Math.floor((a.length - 1) * p)];
}
function stats(a) {
  return {
    median: quantile([...a], 0.5),
    q1: quantile([...a], 0.25),
    q3: quantile([...a], 0.75),
    min: Math.min(...a),
    max: Math.max(...a),
  };
}
const summary = {};
for (const c of cases) {
  const runs = rows.filter((r) => r.name === c.name);
  if (
    runs.some(
      (r) => JSON.stringify(r.outputs) !== JSON.stringify(runs[0].outputs),
    )
  )
    throw new Error(`${c.name}: outputs differ across replicates`);
  const s = { n: runs.length, metrics: {} };
  for (const phase of Object.keys(runs[0].phases)) {
    for (const metric of Object.keys(runs[0].phases[phase])) {
      s.metrics[`${phase}.${metric}`] = stats(
        runs.map((r) => r.phases[phase][metric]),
      );
      if (phase !== 'before')
        s.metrics[`${phase}.delta.${metric}`] = stats(
          runs.map((r) => r.phases[phase][metric] - r.phases.before[metric]),
        );
    }
  }
  for (const metric of [
    'importMs',
    'constructMs',
    'offlineMs',
    'firstSchemaMs',
    'schema1000Ms',
  ])
    if (metric in runs[0].timings)
      s.metrics[metric] = stats(runs.map((r) => r.timings[metric]));
  s.metrics.wallMs = stats(runs.map((r) => r.wallMs));
  s.metrics.maxRssKiB = stats(runs.map((r) => r.maxRssKiB));
  s.resources = runs[0].resources;
  s.outputs = runs[0].outputs;
  s.networkAttempts = runs.reduce(
    (a, r) => a + r.blockedFetches + r.blockedSockets,
    0,
  );
  summary[c.name] = s;
}
writeFileSync(`${outPrefix}.summary.json`, JSON.stringify(summary, null, 2));
if (baseline) {
  const comparisons = [];
  for (const [name, reference] of Object.entries(baseline.cases)) {
    if (!summary[name]) continue;
    const before = reference.memory.heapUsed.median;
    const after = summary[name].metrics[`${reference.phase}.heapUsed`].median;
    comparisons.push({
      name,
      before,
      after,
      heapRatio: after / before,
      reductionPercent: (1 - after / before) * 100,
    });
  }
  const primary = comparisons.filter(
    (x) => x.name === 'locked-import' || x.name === 'locked-schema',
  );
  if (primary.length !== 2)
    throw new Error(
      'Baseline gate requires locked-import and locked-schema cases.',
    );
  writeFileSync(
    `${outPrefix}.comparison.json`,
    JSON.stringify({ baselineFile, comparisons }, null, 2),
  );
  if (primary.some((x) => x.heapRatio > baseline.targetMaxHeapRatio))
    throw new Error(
      'Retained-heap reduction is below the required baseline target.',
    );
}
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
