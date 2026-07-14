# Sprint 5 launch audit

Status: **Not ready for production checkout**

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
- Checkout remains sandbox-only and disabled.

## Current production blocker

On 2026-07-13, `localfiletoolkit.com` did not resolve in DNS from the launch
environment. Until the domain is connected to the Worker through Cloudflare
Custom Domains, production HTTP, HTTPS, `/api/readiness`, sitemap delivery, and
checkout-domain approval cannot be verified.

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
6. Run controlled Standard and bundle purchases, confirm product-specific D1
   entitlements after signed webhooks, and replay duplicate and retry cases.
7. Only after all gates are green, change the shared checkout portal to live
   production mode and deploy.
8. Submit the final sitemap to Google Search Console and Bing Webmaster Tools.

See [PRODUCTION_ROLLOUT.md](PRODUCTION_ROLLOUT.md) for the detailed operator
runbook. Do not mark a gate complete from a public success URL alone; paid access
must be observed after verified webhook fulfillment.
