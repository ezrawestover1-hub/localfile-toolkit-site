# ContactCraft product matrix

This is the implementation source of truth for ContactCraft’s product-specific access states. It records promises that are present in the current ContactCraft UI, checkout configuration, and converter code; it does not add unimplemented quotas or field-preservation claims.

| Capability | Free / unpaid | ContactCraft Standard | ContactCraft Plus | Complete Plus Bundle |
| --- | --- | --- | --- | --- |
| Account required | No for sample and first real file | Account/license restore for the paid workspace | Account/license restore for the paid workspace | Account/license restore for the paid workspace |
| Local processing | Yes | Yes | Yes | Yes |
| Input formats | `.vcf`, `.vcard`, comma-separated `.csv` | Same core formats | Same core formats | Same core formats |
| Output formats | CSV spreadsheet or VCF/vCard 3.0 subset | Same core formats | Same core formats | Same core formats |
| File-size limit | 10 MB per selected file | The current pricing promise is unlimited core conversions; the converter still validates the existing 10 MB client-side file ceiling | Same core conversion ceiling unless product configuration changes | Same as ContactCraft Plus |
| Free usage limit | One complete real contact file per browser installation; sample data does not consume it | No free-file limit after verified ContactCraft Standard access | No free-file limit after verified ContactCraft Plus access | No free-file limit after verified bundle access |
| Core preview | Parsed name, email, phone, and organization rows; validation count | Yes | Yes | Yes |
| Recognized fields | Name, first/last name, email, phone, organization, address | Same | Same | Same |
| Multi-value fields | First email and first phone value; other values may be omitted | Same parser limitation | Same parser limitation | Same parser limitation |
| CSV handling | Header row, comma delimiter, quoted commas, UTF-8 BOM | Same | Same | Same |
| Plus workflow tools | Locked | Locked | Duplicate review, merge duplicates, field cleanup, output field mapping, saved local presets, validation report | Included through ContactCraft Plus |
| History, sync, or remote storage | Not provided | Not promised by current sources | Not promised by current sources | Not promised by current sources |

## Entitlement rules

ContactCraft access is resolved from the `contactcraft` product entitlement or an explicit `suite` bundle entitlement. A purchase of another product does not change ContactCraft’s tier. The highest active ContactCraft entitlement wins: `plus` over `standard`, otherwise `free`. Revoked entitlements are ignored.

The complete bundle provides ContactCraft Plus because the current checkout configuration fulfills a Plus entitlement for each of the five products. Bundle promotion is visible before the first purchase and is suppressed during ordinary ContactCraft use after any purchase; plan management can still expose it.

## Trusted enforcement boundary

Paid routes are guarded by the shared account and license verification flow. The Standard and Plus route scripts restore and verify product-specific entitlements, while ContactCraft Plus controls separately require `canUsePlus("contactcraft")` or an authorized Plus route. ContactCraft performs conversion locally and has no paid conversion API or remote file-storage endpoint; the remaining paid behavior is therefore local UI/workflow gating backed by signed license verification.
