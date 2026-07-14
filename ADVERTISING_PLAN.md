# Privacy-safe advertising plan

Status: **Campaign-ready for a controlled exact-intent test; first live payment still needs end-to-end observation**

For the complete marketer and sales handoff, use
[ADVERTISING_SALES_HANDOFF.md](ADVERTISING_SALES_HANDOFF.md). This document
keeps the detailed campaign notes and the new handoff intentionally aligned.

LocalFile Toolkit has enough focused landing pages to begin with high-intent
search advertising. Do not add advertising pixels, analytics scripts, or remote
conversion trackers to the converter pages. Measure initial campaigns with ad
platform click data, Paddle transactions, and a simple campaign/landing-page
report maintained outside the converter experience.

## Launch prerequisites

Do not spend meaningful budget on paid traffic until all of these are true:

- `localfiletoolkit.com` resolves and serves the final HTTPS site.
- `/api/readiness` is green on the production Worker.
- The first live Standard purchase creates the correct product entitlement after
  a verified Paddle webhook and is monitored in Paddle, Worker logs, and D1.
- The first bundle purchase creates only the promised Plus entitlements and is
  monitored in the same way.
- Refund, support, account verification, and password reset delivery work.
- Terms, privacy, refunds, and operator details have final approval.

## Recommended campaign structure

Begin with exact-format and problem-specific search campaigns. Avoid broad
"converter" targeting until real query data shows that the landing page and
product match the intent.

| Campaign | Primary landing pages | Initial intent |
|---|---|---|
| LedgerHarbor | `ledgerlift/csv-to-iif-converter.html`, `bank-csv-to-iif.html`, `debit-credit-csv-to-iif.html` | CSV to IIF, bank CSV to IIF, debit/credit CSV to IIF |
| PixelRefinery | `pixelport/png-to-jpg-converter.html`, `jpg-to-png-converter.html`, `webp-to-png-converter.html`, `private-image-converter.html` | Exact image format conversion without uploading |
| ContactCraft | `contactcraft/vcf-to-csv-converter.html`, `csv-to-vcard-converter.html`, `open-vcf-in-excel.html` | Contact files to spreadsheets and vCard conversion |
| CalendarFlow | `calendarflow/ics-to-csv-converter.html`, `csv-to-ics-converter.html`, `open-ics-in-excel.html` | Calendar events to spreadsheets and back |
| CaptionShift | `captionshift/srt-to-vtt-converter.html`, `vtt-to-srt-converter.html`, `ass-to-srt-converter.html` | Exact subtitle-format conversion |

Use one ad group per format pair or clearly distinct workflow. The ad, query,
and first heading should describe the same conversion.

## Starter ad copy

These claims match the current implementation and should remain paired with
the corresponding landing page.

### LedgerHarbor

- Headline: `CSV to IIF Converter`
- Headline: `Private Bank CSV Mapping`
- Headline: `Preview Before IIF Export`
- Description: `Map dates, descriptions, and signed amounts locally. Preview and validate rows before creating an IIF file.`
- Description: `Separate debit and credit columns are explained clearly. Review limitations before importing.`

### PixelRefinery

- Headline: `Private PNG to JPG`
- Headline: `Convert Images Locally`
- Headline: `No Image Upload Required`
- Description: `Convert supported PNG, JPG, WebP, and AVIF files in your browser with a source preview.`
- Description: `Review transparency, quality, resize, and browser-support tradeoffs before downloading.`

### ContactCraft

- Headline: `VCF to CSV Converter`
- Headline: `Private Contact Conversion`
- Headline: `Open VCF in a Spreadsheet`
- Description: `Convert common VCF, vCard, and CSV contact fields locally with preview and honest field limitations.`
- Description: `Review names, phones, emails, and addresses before exporting a practical contact file.`

### CalendarFlow

- Headline: `ICS to CSV Converter`
- Headline: `Private Calendar Conversion`
- Headline: `Create ICS from CSV`
- Description: `Review common calendar event fields locally, including title, start, end, location, and description.`
- Description: `Understand time zones, recurrence, reminders, and unsupported ICS properties before export.`

### CaptionShift

- Headline: `SRT to VTT Converter`
- Headline: `Private Subtitle Converter`
- Headline: `Review Timing Before Export`
- Description: `Convert SRT, WebVTT, SBV, and ASS timing and text locally with a readable cue preview.`
- Description: `See what styling, positioning, speaker labels, and rich metadata may be lost between formats.`

## Negative keywords and claim guardrails

Start with negative terms for unrelated tools and unsupported workflows:

- online editor, video editor, translation, transcription, OCR, repair sync,
  send invitations, contact photos, duplicate merger, every field preserved,
  API, bulk upload, unlimited free, free forever, cracked, torrent

Do not claim universal compatibility, perfect preservation, batch processing,
translation, transcription, synchronization repair, or upload-based processing
unless that capability is later implemented and tested for the advertised plan.

For LedgerHarbor, keep third-party compatibility wording factual and lower on the
page. Do not use third-party logos or imply endorsement.

## Measurement without converter tracking

Use campaign names and landing-page URLs in the ad platform, then reconcile:

1. Clicks and search terms from the ad platform.
2. Product-page engagement and free conversion usage from privacy-preserving
   server logs or an aggregate report.
3. Completed Paddle transactions and product-specific entitlements.
4. Refunds and support volume by product and campaign.

Do not add a tracking script merely to obtain a familiar marketing dashboard.
The product promise is local, private conversion, and the measurement design
should respect that promise.
