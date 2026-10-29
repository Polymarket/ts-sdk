# Node.js memory regression measurements

`node-memory-baseline.json` records the upstream baseline before these
changes: revision `6e482eb3431dfb2f8dc5b2beb7e013d13064bea5`, SDK version 0.14.0,
Node 24.19.0 on Linux x86_64. Measurements use installed production tarballs,
not TypeScript source, a development loader, or the workspace node_modules.

The primary baseline freezes the workspace's production dependency versions,
including Zod 4.3.6 and ox 0.14.16. A separate fresh-install baseline records the
same packed SDK with registry-resolved dependencies. Report both: updating an old
lock is not a new memory saving for a consumer already using newer Zod.

## Reproduce

Build all packages and pack the workspace dependencies before the client:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @polymarket/types pack --pack-destination /tmp/sdk-memory/packages
pnpm --filter @polymarket/bindings pack --pack-destination /tmp/sdk-memory/packages
pnpm --filter @polymarket/client pack --pack-destination /tmp/sdk-memory/packages
```

Install all three tarballs together into a separate npm consumer with
`--omit=dev --ignore-scripts --no-audit --no-fund`. Keep that consumer's
package-lock.json. For the frozen profile, pin the non-SDK versions listed in the
baseline's `packages.locked` map; use the intentionally updated Zod resolution
for the optimized case. For the fresh profile, resolve production dependencies
normally. Never use a development workspace as the consumer.

Create a JSON array of cases with absolute consumer directories:

```json
[
  { "name": "locked-import", "consumer": "/tmp/sdk-memory/locked", "entry": "@polymarket/client", "mode": "import" },
  { "name": "locked-schema", "consumer": "/tmp/sdk-memory/locked", "entry": "@polymarket/client", "mode": "schema" },
  { "name": "fresh-import", "consumer": "/tmp/sdk-memory/fresh", "entry": "@polymarket/client", "mode": "import" }
]
```

Run measurements while builds, tests, installations, and other benchmarks are
idle. The optional final argument checks the primary import and post-parse
retained heap against the saved 30% reduction target:

```sh
node scripts/memory/benchmark.mjs /tmp/sdk-memory/cases.json /tmp/sdk-memory/result 15 3 benchmarks/node-memory-baseline.json
```

Each case gets three discarded warmup rounds and fifteen measured fresh Node
processes in seeded randomized order. `probe.mjs` performs three explicit GCs
separated by event-loop turns before retained samples. It measures import,
construction, offline ABI/validation/HMAC use, and 3,003 representative schema
parses separately. The schema workload retains only its final parsed results.
Fetch and websocket construction are disabled in benchmark processes.

The runner saves every accepted sample as NDJSON, median/quartile/range summaries,
and baseline comparisons. The gate uses `heapUsed` after GC; RSS, `heapTotal`,
external/array-buffer memory, import time, and complete child-process wall time
are separate metrics. Array buffers are already included in external memory.
An immediate post-import sample is not a peak heap measurement. These are fresh
module caches after filesystem-cache warmup, not cold-machine measurements.

The offline test guard permits local test servers and rejects external network
connections. It is only enabled explicitly for verification, not shipped in SDK
entry points:

```sh
NODE_OPTIONS="--import=$PWD/scripts/memory/deny-external-network.mjs" pnpm exec vitest run --project types --project bindings --project client --passWithNoTests --maxWorkers=2
```

Zod Mini was also prototyped against real schemas. Replacing exported Classic
schemas changes their fluent methods and error types. A private hybrid provided
no useful retained-heap gain and increased it on newer Zod. This change therefore
keeps Classic schemas, validation, the SDK error formatter, and crypto
implementations. The patched Zod version can select one union branch's issues
where older versions reported every branch; the tests cover both selected-branch
and multi-branch diagnostics.

## Verified result

On Node 24.19.0/Linux x86_64, using fifteen fresh-process replicates:

| Profile | Baseline heap | Optimized heap | Reduction |
| --- | ---: | ---: | ---: |
| Frozen source lock, root import | 78.85 MiB | 21.27 MiB | 73.0% |
| Same, after 3,003 schema parses | 79.82 MiB | 22.65 MiB | 71.6% |
| Fresh dependency resolution, root import | 25.18 MiB | 21.49 MiB | 14.6% |

The 30% primary target passes for import and post-parse retained heap. Fresh
consumers already receive newer Zod and therefore do not get the old-lock saving.
The frozen graph differs only in Zod 4.3.6 -> 4.6.7; all other dependency versions
match. Fresh before/after dependency versions match completely, including Zod
4.6.7 and ox 0.14.60. The optimized packages were repacked after rebasing on
`fd96979bd43fa4ed9a15d1daf6e13df5ac1a72d0`, which also includes main's market-schema
changes. Raising the minimum to `^4.6.7` excludes versions affected by
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

The original baseline passed 1,407 tests. After rebasing over main's five added
tests and adding two security/diagnostic regression tests, all 1,414 tests in 98
files pass. The union diagnostic snapshot intentionally follows Zod 4.6.7; invalid
input is still rejected. A bounded-array test proves oversized input is rejected
before its elements are inspected. Full build, lint, and workspace typecheck
pass. The packed production consumer's `npm audit --omit=dev` reports zero
vulnerabilities. Installed-package checks preserve all existing root/actions/node
export names and verify the new
HMAC entry loads only two SDK modules, no ox/Zod/bindings, and has the same
function identity through ESM, native require(esm), and the root export.

`node-memory-results.json` stores all memory categories, repeatability ranges,
installed package versions, measured comparisons, validation, and limitations.
No claims about other Node/OS versions, sustained leaks, or live authenticated
workflows follow from these offline measurements.
