# SEO metadata audit

Date: 2026-07-14

## Scope

Audited all 43 public product and format-specific URLs listed in `sitemap.xml`
under LedgerHarbor, PixelRefinery, ContactCraft, CalendarFlow, and CaptionShift.

Every audited page now has a nonempty unique title and description, an exact
`https://localfiletoolkit.com/` canonical URL, `robots` set to `index,follow`,
Open Graph title/description/URL/type, Twitter title/description/card metadata,
exactly one H1, and valid SoftwareApplication, BreadcrumbList, and FAQPage JSON-LD
where the page contains the corresponding content.

## Changed pages

- `ledgerlift/csv-to-iif-converter.html` — clarified the IIF outcome, field mapping,
  validation, and browser workflow.
- `pixelport/png-to-jpg-converter.html` — clarified transparent-pixel background
  handling and local review before download.
- `contactcraft/vcf-to-csv-converter.html` — clarified common contact-field preview
  and spreadsheet export before importing elsewhere.
- `calendarflow/ics-to-csv-converter.html` — clarified event-field preview and
  time-zone review before export.
- `captionshift/srt-to-vtt-converter.html` — clarified cue preview, timing review,
  and styling/positioning limitations.

Titles, canonical URLs, headings, structured data, and page functionality were
preserved. No meta keywords tag was added, and no unsupported compatibility,
privacy, backup, translation, transcription, repair, or perfect-preservation
claims were introduced.
