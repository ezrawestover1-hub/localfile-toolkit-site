# Google Ads controlled-launch plan

Status: **Paused plan. No campaigns are enabled by this repository.**

This is a small, high-intent starting plan for later use after production
payments, email, legal review, and `/api/readiness` have been observed. It does
not change Google Ads settings and does not add analytics or tracking pixels.

## Campaign structure

- Create one Search campaign per product.
- Use one ad group per exact format or workflow.
- Keep the suite/bundle campaign separate from individual products.
- Start with LedgerHarbor only.
- Use exact-intent traffic first; phrase match can be tested later.
- Search Network only; Display Network off initially.
- Search partners off initially.
- United States initially; English initially.
- Suggested starting budget: `$5/day`.
- Suggested initial maximum CPC guidance: `$0.75–$1.25`; this is not a guaranteed market price.
- Use the exact-intent landing page as the final URL, not the suite homepage.
- Do not enable broad match at launch.

## LedgerHarbor starting ad groups

1. CSV to IIF — `ledgerlift/csv-to-iif-converter.html`
2. Bank CSV to IIF — `ledgerlift/bank-csv-to-iif.html`
3. Debit/Credit CSV to IIF — `ledgerlift/debit-credit-csv-to-iif.html`
4. Spreadsheet to IIF — `ledgerlift/create-iif-from-spreadsheet.html`

Exact-match examples:

- `[csv to iif converter]`
- `[convert csv to iif]`
- `[bank csv to iif]`
- `[debit credit csv to iif]`
- `[spreadsheet to iif]`

## Negative keywords

Start with: `translation`, `transcription`, `OCR`, `video editor`,
`subtitle translation`, `API`, `cracked`, `torrent`, `free forever`, `cloud
storage`, `repair file`, `data recovery`, `mobile app`, `bookkeeping service`,
`accountant for hire`, `payroll`, and `tax filing`.

Add product-specific negatives when search terms show unsupported intent. Review
search terms before widening targeting.

## Bidding and measurement

Document Maximize Clicks with a CPC cap as the initial option. Wait for reliable
real purchase data before considering Target CPA or Target ROAS.

Reconcile outside converter pages using campaign, ad group, search term,
landing-page URL, completed Paddle transaction, verified entitlement, refund,
and support request. Do not add tracking pixels or analytics to converter pages
to obtain this report. Any future analytics requires a separate privacy review.

## Pause conditions

Pause traffic for an incorrect entitlement, failed webhook verification,
checkout mismatch, broken account email, landing-page error, unexpected refund
volume, unsupported search intent, spend without qualified engagement, or any
privacy-claim mismatch.
