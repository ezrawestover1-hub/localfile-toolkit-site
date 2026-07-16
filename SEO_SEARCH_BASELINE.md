# Search baseline and operating rules

Date: 2026-07-15

## Purpose

This is the starting point for search growth work on LocalFile Toolkit. It keeps
the site focused on useful format- and workflow-specific pages rather than
creating thin pages for every loosely related query.

## Current verified baseline

- Search Console accepts `https://localfiletoolkit.com/sitemap.xml` and reports
  48 discovered URLs.
- Manual Actions and Security Issues reported no issues when checked.
- Performance and Core Web Vitals data are still too new to use for decisions.
- The repository audit requires every sitemap URL to have an exact production
  canonical, `index,follow`, one H1, complete social metadata, and valid JSON-LD
  when structured data is present.
- Account, license, and checkout routes are deliberately outside the sitemap
  and use `noindex,nofollow`.

Run the repository check with:

```sh
npm run seo:audit
```

## Search-intent map

| Product area | Primary user intent | Existing destination |
| --- | --- | --- |
| LocalFile Toolkit | Find a private browser-based converter by file category | `/` |
| LedgerHarbor | Convert a transaction CSV to a reviewable IIF export | `/ledgerlift/csv-to-iif-converter.html` |
| LedgerHarbor | Prepare a bank CSV, separate debit/credit columns, or map a spreadsheet | `/ledgerlift/bank-csv-to-iif.html`, `/ledgerlift/debit-credit-csv-to-iif.html`, `/ledgerlift/create-iif-from-spreadsheet.html` |
| LedgerHarbor education | Understand CSV mapping, cleanup, and IIF review | `/ledgerlift/guides/` |
| PixelRefinery | Convert between PNG, JPG, WebP, and AVIF locally | `/pixelport/` and its format pages |
| ContactCraft | Move contact data between VCF/vCard and CSV | `/contactcraft/` and its format pages |
| CalendarFlow | Convert calendar events between ICS and CSV | `/calendarflow/` and its workflow pages |
| CaptionShift | Convert subtitle files between SRT, VTT, SBV, and ASS | `/captionshift/` and its format pages |

Each page should answer the exact workflow named by its title, provide a clear
route into the working tool, and describe limitations where a source format or
destination application can vary.

## Indexability policy

| Route class | Indexing policy | Reason |
| --- | --- | --- |
| Product homepages, format pages, and LedgerHarbor guides | `index,follow` and sitemap inclusion | These are the pages intended to answer search intent. |
| Suite pages, pricing, legal, support, contact, and refund-request pages | `index,follow` and sitemap inclusion | These provide public trust, support, and policy context. |
| Account, license, and checkout portal pages | `noindex,nofollow` and no sitemap inclusion | These are transactional or account-specific journeys, not search destinations. |
| API routes and static assets | No sitemap inclusion | They are not human search destinations. |

Do not block an indexable page in `robots.txt`. Do not add query-string or
staging URLs to the sitemap. Keep canonical URLs on the final HTTPS domain.

## Content and structured-data rules

- Use the brand name **LocalFile Toolkit** in public suite copy. Product names
  remain LedgerHarbor, PixelRefinery, ContactCraft, CalendarFlow, and
  CaptionShift; internal directory keys do not change.
- Use `SoftwareApplication`, `BreadcrumbList`, or `FAQPage` only when the page
  visibly supports the corresponding information. FAQ questions in JSON-LD must
  match visible questions.
- Do not add ratings, reviews, user counts, pricing claims, compatibility
  promises, or organization/operator details that cannot be verified.
- Do not add a `meta keywords` tag or force repeated phrases into titles,
  headings, or body copy.
- Keep claims specific: local processing only where the converter truly runs in
  the browser, and review/compatibility language where outputs depend on another
  application.

## Weekly operating loop

1. In Search Console, inspect Performance by page and query after enough data
   exists to be useful. Compare clicks, impressions, CTR, and average position
   over a 28-day window instead of reacting to a single day.
2. Check Page indexing, Sitemaps, Manual Actions, Security Issues, and Core Web
   Vitals. Record a date and concrete result for any change.
3. Improve one page only when its query and its existing intent match. Strengthen
   examples, instructions, limitations, and internal links before creating a
   new route.
4. For paid search, review real search terms separately from organic SEO. Do not
   copy irrelevant broad-match terms into page content merely because they got
   an impression or click.
5. Run `npm run seo:audit`, `npm test`, and `npm run build` before publishing an
   SEO change.

## Next decisions after data matures

- Use Search Console queries to choose the next high-intent landing-page or
  guide improvement.
- Use a controlled, privacy-reviewed conversion-measurement plan before
  optimizing ads for purchases. A purchase confirmation page alone is not proof
  of fulfilled access.
- Keep the first commercial focus on LedgerHarbor until purchase, fulfillment,
  account access, support, and reversal handling have been observed end to end.
