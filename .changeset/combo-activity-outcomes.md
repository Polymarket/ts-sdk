---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Preserve available basket token outcomes in wallet activity trades and redemptions.
Blank labels and unknown index 999 become undefined; known index zero is retained.
Automatic redemptions continue to use the REDEEM activity kind.

RedeemActivity now includes ClobRedeemActivity and ComboRedemptionActivity, with
isCombo false/true distinguishing ordinary market conditions from Combo conditions.
Narrow on isCombo before reading ordinary slug/eventSlug metadata. Code constructing
ordinary redemption models must include isCombo: false. Both variants expose optional
outcome and outcomeIndex. Combo redemption titles may be unavailable and are optional.
Existing ComboTradeActivity positionId remains required;
ComboRedeemActivity from listComboActivity is unchanged.
