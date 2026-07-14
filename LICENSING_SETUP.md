# LocalFile Toolkit licensing setup

Phase 1 keeps Paddle in sandbox mode and adds a Cloudflare Worker + D1 fulfillment boundary. Static product pages still load from the same asset directory; the Worker handles only `/api/*` routes and passes every other request to the existing assets binding.

## 1. Create and migrate D1

From the repository root:

```sh
npx wrangler d1 create localfile-toolkit-licenses
# Copy the returned database_id into wrangler.jsonc.
npx wrangler d1 migrations apply localfile-toolkit-licenses --remote
```

For local development:

```sh
npx wrangler d1 migrations apply localfile-toolkit-licenses --local
npx wrangler dev
```

The committed migration creates the requested tables and an additional `restore_requests` table. `activations.token_id` is an opaque public lookup identifier used in signed documents; raw database IDs are not returned to the browser.

## 2. Configure Cloudflare

The committed `wrangler.jsonc` contains the binding name and a placeholder database ID. Replace only that account-generated placeholder:

```jsonc
"d1_databases": [{
  "binding": "LICENSE_DB",
  "database_name": "localfile-toolkit-licenses",
  "database_id": "YOUR_D1_DATABASE_ID",
  "migrations_dir": "migrations"
}]
```

Set these encrypted Worker secrets. They must never be placed in HTML, JavaScript assets, GitHub, or `paddle-config.js`:

```sh
npx wrangler secret put PADDLE_WEBHOOK_SECRET
npx wrangler secret put LICENSE_SIGNING_SECRET
npx wrangler secret put SUPPORT_EMAIL_API_KEY
```

Use a long random value for `LICENSE_SIGNING_SECRET`. For local development, copy `.dev.vars.example` to `.dev.vars` and replace every placeholder. `.dev.vars` is ignored by Git.

Set these non-secret Worker variables in the dashboard or a local `.dev.vars` file, using the exact Paddle sandbox price IDs:

`PADDLE_PRICE_LEDGERLIFT_STANDARD`, `PADDLE_PRICE_LEDGERLIFT_PLUS`, `PADDLE_PRICE_PIXELPORT_STANDARD`, `PADDLE_PRICE_PIXELPORT_PLUS`, `PADDLE_PRICE_CONTACTCRAFT_STANDARD`, `PADDLE_PRICE_CONTACTCRAFT_PLUS`, `PADDLE_PRICE_CALENDARFLOW_STANDARD`, `PADDLE_PRICE_CALENDARFLOW_PLUS`, `PADDLE_PRICE_CAPTIONSHIFT_STANDARD`, `PADDLE_PRICE_CAPTIONSHIFT_PLUS`, and `PADDLE_PRICE_SUITE_BUNDLE`.

For the support and refund form delivery bindings and the intended recipient `localfiletools.support@gmail.com`, follow [SUPPORT_EMAIL_SETUP.md](SUPPORT_EMAIL_SETUP.md). Do not enable production delivery until the provider endpoint and sender domain have been tested.

## 3. Configure Paddle sandbox

1. In Paddle, select sandbox mode and create the eleven one-time sandbox prices described in `PAYMENTS_SETUP.md`. Repeat the catalog setup in live only after sandbox behavior is verified.
2. Keep local development on `environment: "sandbox"` and use only a `test_...` client-side token. Production values are injected by the Worker and are not committed.
3. Create a sandbox notification destination pointing to `https://YOUR_DOMAIN/api/paddle/webhook`.
4. Subscribe it to `transaction.completed`, `adjustment.created`, and `adjustment.updated`, then copy the destination secret into `PADDLE_WEBHOOK_SECRET`.
5. Keep sandbox and live webhook destinations, API keys, client tokens, and price IDs separate. Never reuse a sandbox secret in production.

The webhook reads the raw body, validates the official `ts:raw_body` HMAC-SHA-256 signature, rejects timestamps older than five minutes, and maps only server-configured line-item price IDs. Each event moves through `processing`, `failed`, or `fulfilled` state. Only a confirmed `fulfilled` state is treated as a successful duplicate; failed or stale processing states remain retryable. The `entitlement_purchase_guards` table prevents a second active purchase for the same customer, product, and plan while allowing a repurchase after a confirmed refund. D1 batches and unique constraints make entitlement and activation-code writes safe to resume. Browser query parameters, success URLs, email, product names, and plan names never determine entitlement.

If the completed transaction does not contain a valid customer email, the Worker retrieves the Paddle customer by `customer_id` using the server-only `PADDLE_API_KEY` and `PADDLE_API_BASE_URL`, then validates and normalizes the returned email. A temporary Paddle or D1 failure returns a non-2xx response so Paddle retries. An invalid or missing email never creates an account-linked entitlement.

Paddle transaction item IDs are read from `data.details.line_items[].id` and stored on each entitlement so partial adjustments can target the correct product. The current checkout sends one catalog price per transaction; for older records created before item IDs were stored, an approved single-line adjustment is applied to all entitlements on that transaction. If an approved adjustment cannot match an active entitlement, the Worker returns a retryable error instead of marking the adjustment as successfully fulfilled with zero access changes.

## 4. Test locally

```sh
NODE=/Users/ezrawestover/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
$NODE --check worker.js
$NODE --test tests/*.test.js
npx wrangler dev
```

In development-only mode (`DEVELOPMENT=true`), the test fixture receives activation codes from a local webhook response and restore requests create a `development_only_pending` record. Production mode never returns activation codes and does not persist the development restore record. A real provider integration must generate or select a restore code in memory and deliver it by email; the integration point is the `restore_requests` table and the `handleRestore` branch in `worker.js`.

## 5. Complete sandbox purchase test

1. Configure the sandbox token and price IDs in `checkout-portal/paddle-config.js`.
2. Open the checkout portal, select a product and plan, and complete a Paddle sandbox purchase.
3. Confirm the webhook destination receives `transaction.completed` and that `/api/health` returns only `{ "status": "ok" }`.
4. Confirm the D1 `paddle_events` row reaches `fulfilled` only after the `customers`, `entitlements`, and `activation_codes` rows exist. A temporary fulfillment failure must leave the event `failed` or retryable `processing`, and a replay must finish fulfillment without adding another entitlement or activation code.
5. Repeat the same product/plan with a new sandbox transaction. The webhook should acknowledge `duplicate_purchase` without issuing another entitlement or activation code.
6. In Paddle sandbox, create a full refund or chargeback adjustment and verify that `adjustment.created`/`adjustment.updated` moves the entitlement, activation code, and active device tokens to revoked. For a partial adjustment, verify only the matching `txnitm_` line item is revoked. Replaying the adjustment must be a successful duplicate and safely reconcile a prior zero-target attempt. A reversal event restores only the matching revoked access.
7. Deliver the generated activation code through the pending email integration, open `/license/activate.html`, and activate it on a browser.
8. Open `/license/manage.html` and verify the signed entitlement. Remove it locally and confirm that it is no longer used by the shared frontend module.

## Security limitations and launch blockers

- Transactional email is not configured. Restore requests are recorded generically but no production email is sent yet. The Paddle API key is required for customer-email fallback and customer-portal sessions, with the Paddle `customer.read` and `customer_portal_session.write` permissions needed for those operations.
- `adjustment.created` and `adjustment.updated` now handle approved refunds, credits, chargebacks, chargeback warnings, and their supported reversals. Full adjustments revoke the whole transaction; partial adjustments revoke the affected full or partial line item. Rejected or pending-approval refunds are recorded but do not revoke access until Paddle sends an approved update. Subscription cancellation and other subscription lifecycle events remain outside this one-time-license flow.
- There is no customer-facing remote deactivation or device-management UI. Browser removal only removes the local token.
- The Worker uses an in-memory rate limiter only as a development fallback. Configure a Cloudflare-backed `RATE_LIMITER` binding or equivalent edge protection before production; this fallback is not production-grade across Worker isolates.
- Plus converter controls remain unchanged and are intentionally not unlocked in this phase.
- A production launch still requires reviewing retention, support, refunds, tax/legal wording, rate limiting/WAF rules, secret rotation, D1 backup/restore practice, and sandbox-to-live rollout controls.
- Migrations `0003_webhook_fulfillment_state.sql` through `0008_purchase_refund_handling.sql` must be applied in order on every configured D1 database before enabling webhook delivery. Paddle notification logs may safely replay completed transactions and adjustment events: only events already marked `fulfilled` are treated as duplicates, while `processing` and `failed` events remain retryable.
