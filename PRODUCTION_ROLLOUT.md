# Production rollout runbook

This runbook covers the external work that cannot be safely completed by editing
the repository alone. Production checkout is currently configured, but keep the
site under controlled rollout until the remaining gates below are verified.

## Cloudflare domain and rate limiting

1. In the Cloudflare account that owns `localfiletoolkit.com`, add the Worker as a
   Custom Domain for `localfile-toolkit-site`. Confirm the zone is active and the
   certificate covers the final apex/www choice.
2. Confirm these URLs on the custom domain before changing payment configuration:
   `/`, `/pricing.html`, `/api/health`, `/api/readiness`, and one `.html` landing page.
3. The repository now declares a `RATE_LIMITER` binding with account namespace ID
   `20260713`, allowing eight submission attempts per 60 seconds per client key.
   If the account already uses that namespace ID, choose another positive,
   account-unique integer in `wrangler.jsonc` before deploying.
4. Deploy the Worker with the binding and confirm the production Worker variable
   `REQUIRE_DURABLE_RATE_LIMITER=true` is present.
5. Confirm `/api/readiness` is HTTP 200. If the binding is missing or errors, the
   submission endpoints fail closed instead of silently relying on per-isolate
   memory.

The binding is intentionally declared in `wrangler.jsonc` so the deployment is
fail-closed if the durable limiter is unavailable. A dry run confirms the
binding shape, but only a production deployment and readiness check can confirm
that the account configuration is active.

## Email delivery

Configure separate verified sender values for account verification/reset mail and
support/refund mail. Set these as Worker variables or secrets, never as frontend
configuration:

- `AUTH_EMAIL_API_URL`, `AUTH_EMAIL_API_KEY`, `AUTH_EMAIL_FROM_ADDRESS`
- `SUPPORT_EMAIL_API_URL`, `SUPPORT_EMAIL_API_KEY`, `SUPPORT_EMAIL_FROM_ADDRESS`
- `SUPPORT_RECIPIENT_EMAIL`

Submit one non-sensitive contact request, one refund request, one account
verification request, and one password reset request. Confirm delivery, sender
authentication, error handling, and that the frontend does not claim delivery
when the provider is unavailable.

## Paddle live rollout

1. Create or verify the eleven live one-time prices and the complete bundle. Match
   the product/plan mapping in `PAYMENTS_SETUP.md`; set quantity min/max to 1.
2. Create or verify a live webhook destination for `/api/paddle/webhook`, subscribe to
   `transaction.completed`, `adjustment.created`, and `adjustment.updated`, and set
   `PADDLE_WEBHOOK_SECRET` as a Worker secret.
3. Set the live `PADDLE_API_KEY` with only the required customer lookup and portal
   permissions. Change `PADDLE_API_BASE_URL` to the live API endpoint.
4. Production webhook requests enforce the current Paddle IPv4 source list from
   `https://api.paddle.com/ips`; the Worker refreshes that list periodically and
   rejects missing or non-Paddle source IPs. Do not replace this with a hard-coded
   list. Signature and timestamp verification remain mandatory as well.
5. Verify a live client-side token and all live `pri_...` IDs in
   `checkout-portal/paddle-config.js`. Keep private API keys and webhook secrets
   out of the repository.
6. Run one controlled purchase for an individual Standard plan and one for the
   bundle. Confirm the signed-in account receives exactly the expected
   product-specific entitlements and no other applet unlocks accidentally.
7. Confirm a duplicate webhook is idempotent, a failed D1 fulfillment is retried,
   the Paddle customer portal opens only for an authenticated owner, and a refund
   request reaches support.
8. Keep the production Worker on `checkoutEnabled=true` and `environment=production`
   only while the live catalog, webhook, readiness, and monitoring checks remain green.

## Legal and support sign-off

The current terms contain explicit review placeholders. A launch owner must supply
the operator identity, governing law, refund policy, support contact, tax wording,
and any required business disclosures, then obtain legal review. Do not remove the
placeholders by guessing at jurisdiction-specific language.
