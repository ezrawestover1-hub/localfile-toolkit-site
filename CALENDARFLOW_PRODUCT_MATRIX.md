# CalendarFlow product matrix

This is the implementation source of truth for CalendarFlow’s product-specific access states. It records capabilities present in the current converter, Plus workflow, checkout configuration, and visible product copy without inventing provider compatibility or unsupported calendar behavior.

| Capability | Free / unpaid | CalendarFlow Standard | CalendarFlow Plus | Complete Plus Bundle |
| --- | --- | --- | --- | --- |
| Account required | No for sample and first real file | Account/license restore for the paid workspace | Account/license restore for the paid workspace | Account/license restore for the paid workspace |
| Local processing | Yes | Yes | Yes | Yes |
| Input formats | `.ics`, `.ical`, comma-separated `.csv` | Same core formats | Same core formats | Same core formats |
| Output formats | CSV spreadsheet or ICS calendar file | Same core formats | Same core formats | Same core formats |
| File-size limit | 10 MB per selected file | The current pricing promise is unlimited core conversions; the converter retains its existing 10 MB client-side file ceiling | Same core conversion ceiling unless product configuration changes | Same as CalendarFlow Plus |
| Free usage limit | One complete real calendar file per browser installation; sample data does not consume it | No free-file limit after verified CalendarFlow Standard access | No free-file limit after verified CalendarFlow Plus access | No free-file limit after verified bundle access |
| Core event fields | Title, start, end, location, description, categories, recurrence, and UID when present | Same | Same | Same |
| Preview and validation | Event count, visible title/start/end/location rows, recurring-rule notice | Yes | Yes | Yes |
| Time handling | Preserves common source timestamp text; UTC and date-only values should be reviewed | Same | Same | Same |
| Plus workflow tools | Locked | Locked | Merge calendars, filter events, normalize recurrence text, save local filters, and download validation reports | Included through CalendarFlow Plus |
| Recurrence | RRULE text may be carried; occurrences are not expanded | Same limitation | Same limitation; normalization does not expand occurrences | Same limitation |
| Provider-specific fields | Attendees, organizers, reminders, alarms, conferencing links, attachments, exceptions, and custom properties are outside the basic schema | Same limitation | Same limitation | Same limitation |
| History, sync, or remote storage | Not provided | Not promised by current sources | Not promised by current sources | Not promised by current sources |

## Entitlement rules

CalendarFlow access is resolved from the `calendarflow` product entitlement or an explicit `suite` bundle entitlement. A purchase of another product does not change CalendarFlow’s tier. The highest active CalendarFlow entitlement wins: `plus` over `standard`, otherwise `free`. Revoked entitlements are ignored.

The complete bundle provides CalendarFlow Plus because the current checkout fulfillment creates a Plus entitlement for each of the five products. Bundle promotion is visible before the first purchase and is suppressed during ordinary CalendarFlow use after any purchase; plan management can still expose it.

## Trusted enforcement boundary

Paid routes are guarded by the shared account and license verification flow. Standard and Plus route scripts restore and verify product-specific entitlements, while CalendarFlow Plus controls separately require `canUsePlus("calendarflow")` or an authorized Plus route. CalendarFlow performs conversion locally and has no paid conversion API or remote calendar-file storage endpoint.
