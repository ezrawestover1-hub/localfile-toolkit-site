# Advertising and sales handoff

This handoff is for a future controlled launch. Advertising remains paused until
the production checklist is observed and signed off.

## Current product and pricing map

| Product | Standard | Plus | Primary message |
|---|---:|---:|---|
| LedgerHarbor | $19.99 | $24.99 | CSV transaction data to reviewable IIF exports |
| PixelRefinery | $2.99 | $5.99 | Local image format conversion with preview and controls |
| ContactCraft | $9.99 | $12.99 | Common VCF/vCard and CSV contact conversion |
| CalendarFlow | $9.99 | $12.99 | ICS/iCalendar and CSV event conversion |
| CaptionShift | $6.99 | $9.99 | Subtitle format conversion with timing review |
| Complete Plus Bundle | — | $39.99 | Plus access to all five products |

All prices are one-time licenses. The five Plus products total `$66.95`; the
bundle saves `$26.96`, approximately 40% off.

## Destination map

Use the exact workflow URL for the ad intent:

- LedgerHarbor: CSV/IIF, bank CSV, debit-credit, and spreadsheet guides.
- PixelRefinery: PNG/JPG, WebP/PNG, and private image workflows.
- ContactCraft: VCF/CSV and VCF-to-spreadsheet workflows.
- CalendarFlow: ICS/CSV and spreadsheet calendar workflows.
- CaptionShift: SRT/VTT and subtitle-format workflows.

Every destination is public, has a working converter CTA, and keeps product
limitations visible. No destination requires login to inspect or try sample data.

## Claim guardrails

Use “local in your browser” only for the converter processing actually performed
there. Keep review language for exported files and browser/application
compatibility limits. Do not promise universal compatibility, perfect
preservation, guaranteed conversion, cloud backup, translation, transcription,
or unsupported batch sizes. Do not use fake reviews, ratings, customer counts,
or third-party trademarks as endorsements.

## Handoff checks

- [ ] `/api/readiness` is green on the production domain.
- [ ] Domain, email, legal, Paddle webhook, and D1 observation gates are complete.
- [ ] Standard, Plus, and bundle prices match the live catalog.
- [ ] Entitlements are verified server-side after webhook fulfillment.
- [ ] Refund/reversal handling has been observed.
- [ ] Google Ads remains paused until the owner approves the controlled plan.
