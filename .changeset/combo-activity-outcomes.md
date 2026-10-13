---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Breaking change in the next 0.x minor: SplitActivity, MergeActivity and
RedeemActivity now include Combo variants. Their conditionId may be a
ComboConditionId and their title may be unavailable. Combo rows have no
ordinary market slug/eventSlug; narrow on isCombo before reading those fields.

Previously, checking only the activity kind allowed market URL access:

```ts
if (activity.type === ActivityType.SPLIT ||
    activity.type === ActivityType.MERGE ||
    activity.type === ActivityType.REDEEM) {
  console.log(activity.slug);
}
```

Use the same public listActivity workflow and check the Combo discriminator:

```ts
const pages = client.listActivity({ user: address });
for await (const page of pages) {
  for (const activity of page.items) {
    if ((activity.type === ActivityType.SPLIT ||
         activity.type === ActivityType.MERGE ||
         activity.type === ActivityType.REDEEM) && !activity.isCombo) {
      console.log(activity.slug);
    }
  }
}
```

Parsed ordinary rows return isCombo: false. Constructed ordinary split, merge
and redemption values may omit it. Combo splits and merges accept missing
presentation metadata without dropping the page. Trades and redemptions retain
available basket token outcome/outcomeIndex; blank labels and index 999 become
undefined, while zero is preserved. Automatic redemption remains REDEEM.
The separate listComboActivity models are unchanged.
