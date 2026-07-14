# LocalFile Toolkit advertising and sales handoff

Status: **Ready for controlled campaign setup; first live payment still needs end-to-end observation.**

This is the handoff for a marketer, sales assistant, or future campaign owner. It
uses the existing SEO landing pages instead of creating duplicate doorway pages.
Each ad should send people to the page that exactly matches the format or problem
they searched for.

## Positioning

LocalFile Toolkit is a family of browser-based file converters for people who
want a focused workflow without uploading the selected file to a conversion
service. The strongest differentiators are:

- The selected file is processed locally in the browser.
- The user can preview and review the result before downloading it.
- Each product has a real free first-file experience.
- Standard is a one-time license for unlimited core conversions after verified access.
- Plus is a one-time license for the implemented advanced workflow controls.
- The $39.99 Complete Plus Bundle unlocks all five Plus products; separate Plus
  purchases total $66.95, so the bundle saves $26.96, approximately 40%.

Do not describe the products as cloud storage, upload-based processing, universal
format repair, translation, transcription, or guaranteed lossless conversion.

## Campaign and landing-page map

Use one campaign per product and one ad group per distinct format or workflow.
The final URL and the first heading should match the ad language.

| Campaign | Best initial landing pages | Search intent |
| --- | --- | --- |
| LedgerHarbor | `/ledgerlift/csv-to-iif-converter.html`, `/ledgerlift/bank-csv-to-iif.html`, `/ledgerlift/debit-credit-csv-to-iif.html`, `/ledgerlift/create-iif-from-spreadsheet.html` | CSV to IIF, bank CSV to IIF, debit/credit mapping, spreadsheet to IIF |
| PixelRefinery | `/pixelport/png-to-jpg-converter.html`, `/pixelport/jpg-to-png-converter.html`, `/pixelport/png-to-webp-converter.html`, `/pixelport/private-image-converter.html` | Exact image conversion, local image conversion, no image upload |
| ContactCraft | `/contactcraft/vcf-to-csv-converter.html`, `/contactcraft/csv-to-vcard-converter.html`, `/contactcraft/export-contacts-to-csv.html`, `/contactcraft/open-vcf-in-excel.html` | VCF/vCard to CSV, CSV to vCard, open contacts in a spreadsheet |
| CalendarFlow | `/calendarflow/ics-to-csv-converter.html`, `/calendarflow/create-ics-from-csv.html`, `/calendarflow/open-ics-in-excel.html` | ICS to CSV, CSV to ICS, calendar spreadsheet conversion |
| CaptionShift | `/captionshift/srt-to-vtt-converter.html`, `/captionshift/vtt-to-srt-converter.html`, `/captionshift/sbv-to-srt-converter.html`, `/captionshift/ass-to-srt-converter.html` | Subtitle format conversion and timing review |
| Suite / bundle | `/pricing.html` | Compare products and buy all five Plus tools |

The product homepage is the fallback URL for broad product-intent searches. Use
the exact-format pages first because they make the search-to-page match clearer.

## Feature and Plus sales matrix

| Product | Standard paid value | Plus value | Price |
| --- | --- | --- | ---: |
| LedgerHarbor | Unlimited CSV-to-IIF conversion, mapping, preview, and basic validation | Saved mapping/account profiles, debit-credit mapping, categorization, duplicate review, downloadable reports | $19.99 / $24.99 |
| PixelRefinery | Unlimited single-image conversion, resize, quality, preview, and export | Batch queue, reusable presets, filename rules, custom backgrounds, target-size web optimization | $2.99 / $5.99 |
| ContactCraft | Unlimited local VCF/vCard and CSV conversion with preview | Duplicate review, merge, field cleanup, output mapping, saved local presets, validation report | $9.99 / $12.99 |
| CalendarFlow | Unlimited local ICS and CSV conversion with preview and validation | Calendar merging, event filtering, recurrence normalization, saved local filters, validation report | $9.99 / $12.99 |
| CaptionShift | Unlimited local SRT, VTT, SBV, and ASS conversion with timing preview | Batch conversion, timing presets, find-and-replace cleanup, validation report | $6.99 / $9.99 |

Standard and Plus are not subscriptions. Plus controls are entitlement-gated and
only appear in the authorized Plus workspace. Do not advertise a Plus capability
outside the matching product row unless the user is being sent to that product's
page.

## Starter Google Ads copy

Use these as responsive-search-ad inputs. Keep the landing page, headline, and
description aligned to the same product and file format.

### LedgerHarbor

- Headlines: `CSV to IIF Converter`; `Private Bank CSV Mapping`; `Preview Before IIF Export`
- Descriptions: `Map dates, descriptions, and amounts locally. Preview and validate rows before creating an IIF file.`
- Descriptions: `Plus adds debit-credit mapping, saved profiles, categorization, duplicate review, and reports.`

### PixelRefinery

- Headlines: `Private PNG to JPG`; `Convert Images Locally`; `No Image Upload Required`
- Descriptions: `Convert supported PNG, JPG, WebP, and AVIF files in your browser with source preview.`
- Descriptions: `Plus adds batch conversion, presets, filename rules, backgrounds, and web-size optimization.`

### ContactCraft

- Headlines: `VCF to CSV Converter`; `Private Contact Conversion`; `Open VCF in a Spreadsheet`
- Descriptions: `Convert common VCF, vCard, and CSV fields locally with preview and honest limitations.`
- Descriptions: `Plus adds duplicate review, merge, cleanup, output mapping, presets, and validation reports.`

### CalendarFlow

- Headlines: `ICS to CSV Converter`; `Private Calendar Conversion`; `Create ICS from CSV`
- Descriptions: `Review event fields locally, including title, start, end, location, and description.`
- Descriptions: `Plus adds calendar merging, filters, recurrence normalization, saved filters, and reports.`

### CaptionShift

- Headlines: `SRT to VTT Converter`; `Private Subtitle Converter`; `Review Timing Before Export`
- Descriptions: `Convert SRT, WebVTT, SBV, and ASS timing and text locally with a readable cue preview.`
- Descriptions: `Plus adds batch conversion, timing presets, cleanup tools, and validation reports.`

## Negative keywords and claim guardrails

Start with negative keywords for unsupported intent: `translation`, `transcription`,
`OCR`, `video editor`, `repair sync`, `send invitations`, `contact photos`,
`duplicate merger` when unrelated to ContactCraft, `API`, `bulk upload`,
`free forever`, `cracked`, and `torrent`.

Never claim perfect preservation, universal compatibility, unlimited batch size,
remote history, cloud backup, or server-side processing. PixelRefinery's browser
support and 20 MB per-file ceiling, CaptionShift's 5 MB ceiling, and the other
format limitations remain part of the product promise.

## Measurement and handoff

Keep the converter pages free of advertising pixels and third-party analytics so
their privacy promise remains true. The campaign owner should reconcile:

1. Google Ads clicks, search terms, and campaign names.
2. Landing-page URL and product-level support volume.
3. Paddle completed transactions and verified D1 entitlements.
4. Refunds, duplicate-purchase rejections, and support requests.

Use campaign names and landing-page URLs as the first reporting key. If a future
analytics system is added, it requires a separate privacy and consent review; do
not add it by copying a generic tracking snippet into the converter CSP.

## SEO handoff checklist

- Product homepages have product-specific titles, descriptions, canonical URLs,
  share metadata, FAQ/SoftwareApplication structured data, and visible Plus copy.
- Format landing pages have unique descriptions, canonical URLs, one primary
  heading, format-specific guidance, internal links, and sitemap entries.
- `sitemap.xml` contains public product and format routes and excludes account,
  checkout, and license-management routes.
- Submit the final HTTPS sitemap to Google Search Console and monitor indexing,
  queries, click-through rate, and landing-page engagement.
- Keep ad destinations public, functional, and useful without requiring login;
  send paid users to checkout only after they choose a product and plan.
- Review title and description performance after real search data arrives. Do not
  add a `keywords` meta tag or repeat keywords unnaturally.

## Before spending money

- `/api/readiness` is green in production.
- The public domain, HTTPS behavior, and all ad URLs resolve correctly.
- Terms, privacy, refund, operator, and support details are final.
- Account verification and password-reset email delivery work.
- The first live Paddle transaction and verified webhook fulfillment are observed.
- Refund, duplicate-purchase, and entitlement-revocation handling are monitored.

Google Ads setup should begin with a small, exact-intent search test. Expand only
after the first data shows that the query, landing page, product, and completed
entitlement all match.
