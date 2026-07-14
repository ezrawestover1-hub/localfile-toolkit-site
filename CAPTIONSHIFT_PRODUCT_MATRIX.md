# CaptionShift product matrix

This matrix is the implementation source of truth for CaptionShift’s product-specific access states. It reflects the current converter, Plus workflow, checkout configuration, and visible product copy without promising translation, transcription, video processing, or perfect rich-format preservation.

| Capability | Free / unpaid | CaptionShift Standard | CaptionShift Plus | Complete Plus Bundle |
| --- | --- | --- | --- | --- |
| Account required | No for sample and first real file | Account/license restore for the paid workspace | Account/license restore for the paid workspace | Account/license restore for the paid workspace |
| Local processing | Yes | Yes | Yes | Yes |
| Input formats | `.srt`, `.vtt`, `.sbv`, `.ass` | Same core formats | Same core formats | Same core formats |
| Output formats | SRT, WebVTT, SBV, or ASS | Same core formats | Same core formats | Same core formats |
| File-size limit | 5 MB per selected file | Existing 5 MB client-side file ceiling remains | Existing 5 MB client-side file ceiling remains | Same as CaptionShift Plus |
| Free usage limit | One complete real subtitle file per browser installation; sample data does not consume it | No free-file limit after verified CaptionShift Standard access | No free-file limit after verified CaptionShift Plus access | No free-file limit after verified bundle access |
| Core workflow | Parse cues, preview timing/text, apply one bounded timing offset, export locally | Same | Same | Same |
| Rich-format handling | ASS styling and positioning are simplified when output cannot carry them; speaker labels and player positioning require review | Same limitation | Same limitation | Same limitation |
| Plus workflow tools | Locked | Locked | Batch conversion, timing presets, find-and-replace cleanup, and validation reports | Included through CaptionShift Plus |
| Validation | Cue count and invalid timing detection | Same | Adds timing-problem, overlap, and empty-text report | Same as Plus |
| Translation, transcription, video processing | Not provided | Not provided | Not provided | Not provided |

## Entitlement rules

CaptionShift access is resolved from the `captionshift` product entitlement or an explicit `suite` bundle entitlement. A purchase of another product does not change CaptionShift’s tier. The highest active CaptionShift entitlement wins: `plus` over `standard`, otherwise `free`. Revoked entitlements are ignored.

The complete bundle provides CaptionShift Plus. Bundle promotion is visible before the first purchase and suppressed during ordinary CaptionShift use after any purchase; plan management can still expose it.

## Trusted enforcement boundary

Paid routes are guarded by the shared account and license verification flow. Standard and Plus route scripts restore and verify product-specific entitlements, while CaptionShift Plus controls require `canUsePlus("captionshift")` or an authorized Plus route. CaptionShift performs conversion locally and has no paid conversion API or remote subtitle-file storage endpoint.
