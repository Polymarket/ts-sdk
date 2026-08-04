# Review guidance — ts-sdk

<!--
How this file works (guidance for editors — safe to keep or delete):

- Brunson reads this file at the start of every review of this repo, at the
  PR head, and applies it ON TOP OF its standard checklists (bugs, security,
  races, TypeScript checks). It does not replace them.
- Keep it a short INDEX: a handful of high-value, repo-specific rules plus
  links to detail docs. Brunson reads at most 3 linked docs per review,
  choosing the ones closest to the changed paths — so say when each doc is
  relevant.
- Describe how the codebase works and what "consistent with it" means.
  Be specific and name the rule — vague guidance produces vague findings.
- Do NOT write instructions aimed at the reviewer's behavior (approve this,
  skip that, suppress those findings, change the output format) — those are
  ignored and flagged as an issue.
- Changing this file is a normal PR your team owns; guidance versions with
  the code.
-->

## What this repo is

Polymarket's TypeScript SDK monorepo (pnpm workspaces). The main package is
`@polymarket/client`, which presents one cohesive consumer interface over
Polymarket's API surfaces (CLOB, Gamma, Data, relayer) plus experimental
Perps; more SDKs are planned, starting with `@polymarket/react`. Breaking
these packages breaks external integrators, so public API shape and semver
discipline matter more here than in an internal service.

## Always check on any PR here

- Does a schema belong in `packages/bindings` or `packages/client`? Anything
  that parses an upstream HTTP response, websocket frame, or raw API field
  shape belongs in `bindings`; `client` only validates SDK user input or
  client-owned options.
- If an action in `packages/client/src/actions/` changed (signature, param
  types, TSDoc, examples), was the matching decorator method under
  `packages/client/src/decorators/` updated too? The decorator is the public
  surface. New public client additions must be re-exported by the
  corresponding decorator module.
- Method naming reflects SDK behavior, not upstream routes: `list*` returns
  normalized `Paginated<T>`/`Page<T>`; `fetch*` returns a direct item or
  collection. Upstream pagination envelopes (`{ data, more }`, offsets,
  service cursors) must not leak out of `packages/client`.
- Every public Perps surface must carry an `@experimental` TSDoc tag (at the
  original declaration, retained in generated `.d.ts`).
- `ky` details must not leak outside `ServiceClient`; wallet-library
  integrations (e.g. `viem`) stay isolated to their entry points and
  optional peer deps.
- Commit messages follow Conventional Commits (`type(scope): subject`).

## Conventions that are easy to violate

- Build/typecheck behavior lives in `tsconfig.build.json` files; root and
  package `tsconfig.json` are editor-tooling only. A build fix landing in
  the wrong file is a finding.
- Defaults are part of the API: new options need an explicit, least-surprise
  default, documented on the action/decorator types.
- Prefer intent-based options over implementation-detail options on exported
  APIs; don't cargo-cult the shape of underlying APIs or legacy SDKs.

## Detail docs

- [AGENTS.md](../AGENTS.md) — the canonical repo guidelines: package
  boundaries, workflow, API-design guardrails, pagination/naming rules.
  Read when the diff touches any `packages/*` public surface.
- [docs/sdk-direction.md](../docs/sdk-direction.md) — primary design doc.
  Read when the diff adds or reshapes public API.
