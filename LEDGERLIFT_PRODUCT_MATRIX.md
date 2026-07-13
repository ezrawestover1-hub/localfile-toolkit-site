# LedgerLift product matrix

This is the LedgerLift-specific access contract used for the current product implementation. Prices come from `pricing-config.js`; paid capabilities come from `ledgerlift/common.js`, `ledgerlift/plus.js`, `standard-mode.js`, and `plus-mode.js`; checkout benefits are mirrored in `checkout-portal/checkout.js`.

| Access state | Core workflow | Limits and controls |
| --- | --- | --- |
| Free / unpaid | One complete real CSV-to-IIF document per browser installation; sample data remains available for learning; date, description, signed amount mapping, preview, validation, and IIF export | The real-document limit is stored locally under `ledgerlift_free_document_used_v1`. No account history, saved profiles, Plus mapping, categorization, duplicate review, or reports. |
| LedgerLift Standard | Everything in the free core workflow | Unlimited core conversions, automatic column guesses, preview/basic validation, signed amount mapping, and no converter advertising. Separate debit/credit mapping, saved profiles, categorization, duplicate review, and reports remain Plus-only. |
| LedgerLift Plus | Everything in Standard | Unlimited core conversions plus saved mapping/account profiles, separate debit/credit mapping, categorization rules, duplicate review, and downloadable review reports. |
| Complete Plus Bundle | LedgerLift Plus is included | The bundle also grants Plus entitlements for PixelPort, ContactCraft, CalendarFlow, and CaptionShift. The bundle itself is represented as a distinct `suite / bundle` entitlement; it is not inferred from owning five individual products. |

## Entitlement rules

- A product entitlement is keyed by `product_key` and `plan_key`; a generic paid flag is not used to unlock LedgerLift.
- LedgerLift access is `free`, `standard`, or `plus`. A `suite / bundle` entitlement resolves LedgerLift to `plus`.
- A user who owns another product only still receives LedgerLift Free.
- Revoked or inactive records do not grant access. Signed browser tokens are checked against the Worker before Standard or Plus workspaces enable paid behavior.
- LedgerLift conversion is local-only. There is no remote LedgerLift processing API or saved-data endpoint to protect; saved Plus profiles and working data remain in the current browser.

## Known product-definition blockers

- Checkout remains disabled in the supervised sandbox configuration.
- IIF support is intentionally limited to the basic deposit/check-style transaction shapes described on the LedgerLift page. Transfers, split transactions, specialized transaction types, and arbitrary destination applications are not promised.
