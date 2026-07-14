# Launch-readiness audit

Status: **Repository and staging checks ready for controlled verification; not a
claim that production launch gates are complete.**

## Scope

This sprint audits public landing pages, SEO routes, account and utility route
controls, checkout entry wiring, pricing consistency, claim safety, and the
production readiness response shape. It does not launch advertising, alter
Google Ads, change DNS or Cloudflare secrets, change live Paddle settings, add
credentials, or simulate a real production payment.

## Automated checks

`tests/launch-readiness.test.js` now covers:

- Local HTTP 200 checks for the sitemap inventory, utility pages, robots, sitemap,
  and favicon.
- Public ad destinations and working-converter calls to action.
- Product homepage links to pricing, privacy, security, and support.
- Sitemap/canonical separation from account, license, checkout, API, reset, and
  verification routes.
- Production-domain metadata and absence of staging hosts.
- Current prices, one-time wording, bundle math, and checkout quantity one.
- Advertising claim guardrails and absence of common tracking hosts.
- Safe `/api/readiness` response shape with no secret fields.

Existing site, product, entitlement, webhook, SEO, and security tests remain in
the same `npm test` run.

## Passed in repository validation

- Expected public HTML and utility files exist.
- Public sitemap and robots references use the production HTTPS domain.
- Product and format pages retain canonical, H1, structured-data, social-image,
  and internal-link coverage.
- Product labels are LedgerHarbor, PixelRefinery, ContactCraft, CalendarFlow,
  and CaptionShift; internal route keys remain unchanged.
- Prices remain `$19.99/$24.99`, `$2.99/$5.99`, `$9.99/$12.99`,
  `$9.99/$12.99`, `$6.99/$9.99`, and `$39.99` for the bundle.
- Converter pages remain local-processing pages without analytics or ad pixels.
- Checked-in Paddle fallback remains sandbox-safe with `checkoutEnabled: false`.
- `/api/readiness` returns only `ready` and named boolean checks; production
  values are not returned.

## Manual checks still requiring production observation

Use [PRODUCTION_LAUNCH_CHECKLIST.md](PRODUCTION_LAUNCH_CHECKLIST.md) for domain,
email, account, Standard, Plus, bundle, webhook, refund, and reversal checks.
Use [PRODUCTION_ROLLOUT.md](PRODUCTION_ROLLOUT.md) for Cloudflare, Paddle, D1,
email, and legal setup details.

## Blockers before a controlled paid launch

- Production domain, certificate, redirects, and custom-domain behavior must be
  observed on the final domain.
- `/api/readiness` must be HTTP 200 with every check true in production.
- Authentication, support, and refund email delivery must be tested.
- Legal operator, jurisdiction, tax, refund, and limitation language needs owner
  review and approval.
- A real Standard purchase and a real bundle purchase must be observed through
  signed webhook fulfillment and D1, when funds and approval are available.
- Refund/reversal behavior and support identification must be observed.
- Google Ads must remain paused until those gates are complete.

## Non-blocking follow-ups

- Submit and monitor the sitemap in search consoles.
- Capture final social previews on the approved domain.
- Maintain an external campaign-to-transaction reconciliation report if ads are
  later enabled, without adding converter tracking.

## Advertising status

No advertising was launched. No Google Ads settings were changed. See
[GOOGLE_ADS_CONTROLLED_LAUNCH.md](GOOGLE_ADS_CONTROLLED_LAUNCH.md) and
[ADVERTISING_SALES_HANDOFF.md](ADVERTISING_SALES_HANDOFF.md).

## Security and privacy confirmation

No production credentials or secrets were added. No analytics, tracking pixels,
remote advertising scripts, or CSP loosening were added. The audit does not
claim production readiness where live credentials or human observation are still
required.
