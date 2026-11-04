---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Add the range-event activity types `DIRECTIONAL_SPLIT`, `DIRECTIONAL_MERGE`, `THRESHOLD_COMPOSE` and `THRESHOLD_DECOMPOSE` to `ActivityType` and `Activity`, and accept them in the `listActivity` `type` filter.

Parse activity rows with types this SDK version does not enumerate instead of failing the page. They return as `UnknownActivity` with `type: undefined` and the served type in `rawType`.

`Activity` gains these variants, so `activity.type` is now `ActivityType | undefined`. Exhaustive switches over `activity.type` need cases for the new types and a branch for unknown rows:

```ts
if (activity.type === undefined) {
  console.log(activity.rawType, activity.amount);
}
```
