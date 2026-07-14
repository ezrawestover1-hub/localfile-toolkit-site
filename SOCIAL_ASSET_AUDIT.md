# Social asset audit

Sprint 4 adds 15 product-specific PNG assets under `assets/social/`. Each product has the same three dimensions:

- `*-social-1200x630.png` — Open Graph and Twitter preview image
- `*-landscape-1200x628.png` — landscape advertising crop
- `*-square-1200x1200.png` — square advertising crop

All files are RGB PNGs with the exact dimensions above. Approximate file sizes are 230–270 KB for landscape assets and 370–411 KB for square assets. The assets use existing product icons, established product colors, readable system-font copy, and a restrained interface preview panel.

Exact asset sizes at audit time:

| Product | 1200×630 | 1200×628 | 1200×1200 |
|---|---:|---:|---:|
| LedgerHarbor | 236,880 B | 236,419 B | 371,129 B |
| PixelRefinery | 269,040 B | 267,692 B | 410,733 B |
| ContactCraft | 248,634 B | 247,251 B | 373,355 B |
| CalendarFlow | 253,437 B | 252,557 B | 379,728 B |
| CaptionShift | 253,033 B | 251,830 B | 383,966 B |

## Product copy

- LedgerHarbor: “Map CSV transactions into a reviewable IIF export” — CSV, column mapping, validation.
- PixelRefinery: “Convert images locally with a clean preview” — image preview, format conversion, resize.
- ContactCraft: “Review contact fields before you export” — VCF, CSV, names, phones, emails.
- CalendarFlow: “Move calendar events between ICS and CSV” — event fields, date review, calendar export.
- CaptionShift: “Review subtitle timing before conversion” — SRT, VTT, SBV, ASS, cue preview.

## Metadata pages updated

Each product homepage and one primary format landing page now uses the matching 1200×630 asset for `og:image` and `twitter:image`, with absolute HTTPS URLs, dimensions, alt text, and `twitter:card=summary_large_image`.

Primary format pages:

- LedgerHarbor: `ledgerlift/csv-to-iif-converter.html`
- PixelRefinery: `pixelport/png-to-jpg-converter.html`
- ContactCraft: `contactcraft/vcf-to-csv-converter.html`
- CalendarFlow: `calendarflow/ics-to-csv-converter.html`
- CaptionShift: `captionshift/srt-to-vtt-converter.html`

Each primary page also includes a sample-data-only screenshot of the existing product interface, with explicit dimensions, descriptive alt text, and lazy loading.

Screenshot assets: `assets/screenshots/{ledgerlift,pixelport,contactcraft,calendarflow,captionshift}-workflow-900x700.png`, each 900×700 RGB PNG.

## Privacy, CSP, and performance

All social assets and screenshots are local repository files served from the same domain. No image host, tracking pixel, analytics script, remote font, or CSP relaxation was added. Screenshots contain empty/sample-data workspaces only. The assets are intentionally lightweight PNGs because the interface preview uses crisp text and existing icon artwork.

## QA

The social, landscape, and square crops were inspected at their target dimensions. Long copy was wrapped after visual inspection so it remains readable in the landscape crop. Product pages were checked at desktop and mobile sizes with Chromium fallback after the in-app Browser runtime failed to initialize with `Cannot redefine property: process`. Modified routes returned HTTP 200 locally.
