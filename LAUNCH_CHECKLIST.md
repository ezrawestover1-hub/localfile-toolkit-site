# Launch checklist

This is the go/no-go checklist for the production rollout. Sprint 2 is complete in
the repository when the local checks pass, but the account-owned items below must
still be completed and recorded before enabling live checkout.

## Repository checks completed by Sprint 2

- [x] Server-verified Paddle fulfillment remains the only entitlement-creation path.
- [x] D1 webhook event state is retryable and duplicate-safe.
- [x] `/api/readiness` reports production blockers without exposing secrets.
- [x] Durable rate limiting can be required with `REQUIRE_DURABLE_RATE_LIMITER=true`.
- [x] The Worker config declares the `RATE_LIMITER` binding and fails closed when
  the durable limiter is unavailable.
- [x] Static `.html` URLs are served directly so sitemap, canonical, and final URL agree.
- [x] Checkout configuration is environment-specific: local development is sandbox-safe and production declares its live catalog configuration.

## Repository checks completed in Sprints 3–5

- [x] Dedicated product landing pages have unique metadata, canonical URLs,
  structured data, share images, and sitemap coverage.
- [x] The 30 dedicated SEO routes load with one H1 and direct paths into their
  working converters.
- [x] Browser QA completed the real sample conversion and download flow for all
  five applets without console errors.
- [x] Desktop (1440px) and mobile (390px) checks show no horizontal overflow on
  the five product homepages.
- [x] All 151 automated tests pass; JavaScript syntax checks, JSON-LD parsing, and
  local-link validation pass.
- [ ] After deployment, verify the production domain, live catalog, production
  configuration, and `/api/readiness` endpoint. Do not mark this complete until
  the final domain returns the expected production configuration and every
  readiness check is true.

## Account-owned launch gates

- [ ] `localfiletoolkit.com` resolves to the Worker through Cloudflare Custom Domains.
- [ ] HTTPS certificate, redirect behavior, HSTS, and the apex/www decision are verified.
- [ ] Cloudflare Rate Limiting namespace is created and bound as `RATE_LIMITER`.
- [ ] `REQUIRE_DURABLE_RATE_LIMITER=true` is enabled in the production Worker.
- [ ] `/api/readiness` returns HTTP 200 with every check true on the production domain.
- [ ] Final operator identity, governing law, refund terms, and limitation language are legally reviewed.
- [ ] Every public privacy and product terms page has owner/support details finalized.
- [ ] Support and authentication email sender domains are verified and delivery is tested.
- [ ] Paddle live products, prices, tax settings, payment methods, and one-unit limits are verified.
- [ ] Live Paddle webhook destination and secret are configured; a completed transaction is replay-tested end to end.
- [ ] Live Paddle API key has only the permissions required for customer lookup and portal sessions.
- [ ] Live client token and price IDs replace sandbox values only after fulfillment is verified.
- [ ] Refund, chargeback, cancellation, and support handling are tested end to end.
- [ ] Sitemaps are submitted to Google Search Console and Bing Webmaster Tools.

Do not mark the launch gates complete based on the public success URL. Paid access
must be observed in D1 after a verified webhook, and `/api/readiness` must remain
green while checkout is enabled.

## Current controlled-launch documents

- [Production launch observation checklist](PRODUCTION_LAUNCH_CHECKLIST.md)
- [Google Ads controlled-launch plan](GOOGLE_ADS_CONTROLLED_LAUNCH.md)
- [Launch-readiness audit](LAUNCH_READINESS_AUDIT.md)


## Payments

- Create Paddle products and one-time price IDs.
- Add the public client-side token and price IDs to `checkout-portal/paddle-config.js`.
- Approve and verify the public checkout domain.
- Enable Apple Pay, Google Pay, PayPal, and desired regional methods.
- Test all eleven prices in Paddle sandbox.
- Implement a verified `transaction.completed` webhook before automatic license delivery.
- Never unlock access from the browser success URL alone.
