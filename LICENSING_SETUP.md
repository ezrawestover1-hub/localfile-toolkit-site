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

1. In Paddle, select sandbox mode and create the eleven one-time sandbox prices described in `PAYMENTS_SETUP.md`.
2. Keep `checkout-portal/paddle-config.js` on `environment: "sandbox"` and use only a `test_...` client-side token.
3. Create a sandbox notification destination pointing to `https://YOUR_DOMAIN/api/paddle/webhook`.
4. Subscribe it to `transaction.completed` and copy the destination secret into `PADDLE_WEBHOOK_SECRET`.
5. Do not configure live prices, live tokens, or live webhook destinations during Phase 1.

The webhook reads the raw body, validates the official `ts:raw_body` HMAC-SHA-256 signature, rejects timestamps older than five minutes, stores event IDs for idempotency, and maps only server-configured line-item price IDs. Browser query parameters, success URLs, email, product names, and plan names never determine entitlement.

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
4. Confirm the D1 `paddle_events`, `customers`, `entitlements`, and `activation_codes` rows exist. Confirm a replay of the same event does not add another entitlement.
5. Deliver the generated activation code through the pending email integration, open `/license/activate.html`, and activate it on a browser.
6. Open `/license/manage.html` and verify the signed entitlement. Remove it locally and confirm that it is no longer used by the shared frontend module.

## Security limitations and launch blockers

- Transactional email is not configured. Restore requests are recorded generically but no production email is sent yet.
- Refund, chargeback, cancellation, and subscription lifecycle events are not fulfilled in Phase 1; only `transaction.completed` is supported.
- There is no customer-facing remote deactivation or device-management UI. Browser removal only removes the local token.
- Plus converter controls remain unchanged and are intentionally not unlocked in this phase.
- A production launch still requires reviewing retention, support, refunds, tax/legal wording, rate limiting/WAF rules, secret rotation, D1 backup/restore practice, and sandbox-to-live rollout controls.
