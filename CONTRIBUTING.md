# Contributing

We use GitHub Issues as the primary public feedback channel. Please open an issue for bug reports, feature requests, or general feedback.

We are not broadly accepting external pull requests yet. Large changes should not be started without prior discussion and agreement with the Polymarket team.

## HTTP request implementation

`PublicClient.predictions` and `SecureClient.predictions` are reserved,
unconfigured service getters for future polymarket.com UI use. Their
`ServiceClient` has no root or transport and rejects requests with `UserInputError`
before any fetch. This getter is experimental; breaking changes may occur in any
release, including patch releases. Existing service getters, routes,
authentication, and high-level actions retain their behavior. External consumers
should use high-level SDK actions.

Service-client methods return promises that resolve to response data and reject
with SDK errors. In actions, use the configured service supplied by the client
and the response schema from `packages/bindings`. Pass the schema and the
operation's signal together at the request boundary:

```ts
const value = await service.get(path, {
  params,
  schema: ResponseSchema,
  signal: options.signal,
});
```

The schema validates and transforms parsed JSON, and its output determines the
return type. Do not read the body again or compose the request with
`validateWith`, `ResultAsync`, or `unwrap`. Supply a generic type only when
runtime validation is intentionally omitted; a request with neither schema nor
generic returns `unknown`:

```ts
const unchecked = await service.get<ExpectedResponse>(path, {
  signal: options.signal,
});
const data = await service.get(path, { signal: options.signal });
// data: unknown
```

Here `ExpectedResponse` is the caller's declared response model; it does not
validate or transform the returned JSON.

All verbs share the schema, response-mode, and signal contract: `get`, `post`,
`patch`, and `del`. GET accepts `params` and `headers`; POST and PATCH accept
`json` and `headers`; DELETE accepts `json`, `params`, and `headers`.

### Choose a response mode

Set `responseType` when the successful response is not JSON:

| `responseType`   | Resolved value                                                    |
| ---------------- | ----------------------------------------------------------------- |
| `json` (default) | Schema output, unchecked generic type, or `unknown`               |
| `blob`           | `Blob`                                                            |
| `arrayBuffer`    | `ArrayBuffer`                                                     |
| `text`           | `string`                                                          |
| `empty`          | `void`; consume and discard the successful response body          |
| `raw`            | `Response`; return once successful response headers are available |

A schema applies only to JSON. Non-JSON response modes do not accept `schema`.
Raw responses leave body consumption to the caller. The signal remains attached
to the underlying request, but the fulfilled service-client promise cannot
cover a later `response.json()`, `blob()`, or other body read. Handle those
reads and their fetch errors at the call site.

### Compose actions and cancellation

Use direct `await`, `then`, and `catch` for request composition. Pagination
callbacks return `Promise<Page<T>>`; rate-limit retry callbacks return
`Promise<T>`. Keep page normalization and read-retry policy in their existing
owning layers, including `retry: false`. Do not add mutation retries as part of
an async refactor.

When an action translates an error, use `try`/`catch`, match the error that the
action owns, and rethrow other failures unchanged. Preserve the action's public
error union and guard, and update the bound decorator's signature and `@throws`
documentation together with the action.

The operation owns its `AbortSignal`; unrelated requests must not share a
client-wide controller. Reject already-aborted operations before dispatch;
cancellation while resolving authentication must stop waiting and prevent a
late resolver from dispatching a request. ServiceClient carries the signal
through authentication header resolution, transport, retry waits, body
consumption, and the check before schema validation. Cancellation rejects with
`RequestAbortedError` and
preserves `signal.reason` as its cause. Synchronous schema validation cannot be
interrupted after it starts. High-level HTTP reads retain their trailing
`{ signal }` option; this refactor does not extend cancellation into order
submission, wallet workflows, or WebSocket sessions.

`@polymarket/types` no longer exports `neverthrow` APIs or the legacy `unwrap`
helper. Client code uses promises directly. Consumers that still use
`neverthrow` must declare their own dependency and import its APIs from
`neverthrow` instead of `@polymarket/types`. SDK requests need no `unwrap`:
return or await their promises directly.
