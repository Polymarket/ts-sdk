---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Add the range-event activity types `DIRECTIONAL_SPLIT`, `DIRECTIONAL_MERGE`, `THRESHOLD_COMPOSE` and `THRESHOLD_DECOMPOSE` to `ActivityType` and `Activity`, and accept them in the `listActivity` `type` filter. Threshold rows always carry the line's `conditionId` and report the moved line position as `shares`, since no collateral moves. Titles, slugs and outcome labels are optional on all four types.

Activity rows with a type this SDK version does not list no longer fail the page. They keep `type: undefined`, carry the served type in `rawType`, and set `isCombo` so Combo rows are not mistaken for market rows.

`activity.type` is now `ActivityType | undefined`. Exhaustive switches over `activity.type` need cases for the new types and an `undefined` or `default` branch:

```ts
switch (activity.type) {
  case ActivityType.TIP:
    console.log(activity.side);
    break;
  case undefined:
    console.log(activity.rawType, activity.amount);
    break;
}
```
