# Sprint 5 launch audit

Status: **Repository/staging audit complete; production verification and controlled rollout remain pending**

Date: 2026-07-13

Sprint 5 completed the final repository and browser-readiness audit. The local
site is in a shippable verification state, but production launch still depends
on Cloudflare, email, Paddle, and legal configuration outside this repository.

## Verified locally

- 93 automated tests pass.
- All JavaScript files pass syntax checks.
- 35 JSON-LD blocks parse successfully.
- 1,316 local links were checked with no missing targets.
- All 30 dedicated SEO landing routes have a title, description, canonical URL,
  share image, and exactly one H1.
- LedgerHarbor, PixelRefinery, ContactCraft, CalendarFlow, and CaptionShift each
  completed a real sample conversion and download in the browser without
  console errors.
- The five product homepages have no horizontal overflow at 1440px desktop or
  390px mobile widths.
- Product-specific entitlement, bundle, webhook, revocation, retry, and route
  gating tests pass.
- Local checkout remains sandbox-safe; production live-catalog configuration is
  declared in the deployment configuration but still requires verification on
  the final production domain.

## Current production blocker

The production `/api/readiness` result has not been treated as verified in this
repository audit. The remaining launch risk includes the domain, bindings,
secrets, email, legal configuration, and live payment/webhook fulfillment. The
first transaction must be monitored through Paddle notification logs, Worker logs,
and D1 entitlement state after the production readiness checks are green.

## Required owner actions before launch

Complete these in order:

1. Connect `localfiletoolkit.com` to the Worker and verify the final apex/www
   decision, certificate, redirects, and HSTS.
2. Create and bind the Cloudflare rate-limiter namespace, set
   `REQUIRE_DURABLE_RATE_LIMITER=true`, and confirm `/api/readiness` returns HTTP
   200 with every check true.
3. Verify authentication and support sender domains, configure the required
   email secrets, and test verification, reset, contact, and refund delivery.
4. Replace legal review placeholders with approved operator, jurisdiction,
   refund, tax, and support language.
5. Configure and sandbox-test the eleven individual prices plus the bundle;
   then configure the live Paddle webhook, API key, client token, and price IDs.
6. Run controlled Standard and bundle purchases when funds and approval are
   available, confirm product-specific D1
   entitlements after signed webhooks, and replay duplicate and retry cases.
7. Keep the shared checkout portal in live production mode only while the live
   webhook, readiness, and monitoring checks remain green.
8. Submit the final sitemap to Google Search Console and Bing Webmaster Tools.

See [PRODUCTION_ROLLOUT.md](PRODUCTION_ROLLOUT.md) for the detailed operator
runbook. Do not mark a gate complete from a public success URL alone; paid access
must be observed after verified webhook fulfillment.
