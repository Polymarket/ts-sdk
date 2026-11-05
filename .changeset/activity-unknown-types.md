---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Add the range-event activity types `DIRECTIONAL_SPLIT`, `DIRECTIONAL_MERGE`, `THRESHOLD_COMPOSE` and `THRESHOLD_DECOMPOSE` to `ActivityType` and `Activity`, and accept them in the `listActivity` `type` filter. Threshold rows always carry the line's `conditionId` and report the moved line position as `shares`, since no collateral moves. Titles, slugs and outcome labels are optional on all four types.

Activity rows with a type this SDK version does not list no longer fail the page. They carry only the shared account fields, and their `type` is an `OpaqueActivityType` that never matches an `ActivityType` member.

This is a breaking type change, and code that reads `activity.type` may need a migration.

Comparing `activity.type` with `ActivityType` members still narrows each row, but an exhaustive switch over `activity.type` needs cases for the new types and a `default` branch:

```ts
switch (activity.type) {
  case ActivityType.TIP:
    console.log(activity.side);
    break;
  default:
    console.log(activity.wallet, activity.transactionHash);
}
```

`activity.type` is no longer assignable to `string` and can no longer index a record. Read the served type with `String(activity.type)`:

```ts
const labels: Partial<Record<string, string>> = {
  [ActivityType.TRADE]: 'Trade',
  [ActivityType.TIP]: 'Tip',
};

// Before
const type: string = activity.type;
const label = labels[activity.type];

// After
const type = String(activity.type);
const label = labels[type] ?? 'Other';
```
