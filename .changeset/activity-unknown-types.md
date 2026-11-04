---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Parse activity rows with types this SDK version does not enumerate instead of failing the page. They return as `UnknownActivity` with `type: undefined` and the served type in `rawType`.

`Activity` now includes `UnknownActivity`, so `activity.type` is `ActivityType | undefined`. Exhaustive switches over `activity.type` need a branch for it:

```ts
if (activity.type === undefined) {
  console.log(activity.rawType, activity.amount);
}
```
