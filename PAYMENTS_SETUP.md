# Paddle payment setup

The suite is prepared for Paddle Checkout, but it cannot take real money until you create your own Paddle account and insert your public configuration values.

## Why Paddle

Paddle can present cards, Apple Pay, Google Pay, PayPal, and regional methods from one checkout. It acts as merchant of record for supported sales and handles indirect tax calculation/remittance, fraud, chargebacks, compliant receipts, and billing support.

## Catalog to create

Create these one-time products/prices in Paddle:

| Product | Standard | Plus |
|---|---:|---:|
| LedgerLift | $19.99 | $24.99 |
| PixelPort | $2.99 | $5.99 |
| ContactCraft | $9.99 | $12.99 |
| CalendarFlow | $9.99 | $12.99 |
| CaptionShift | $6.99 | $9.99 |

Create one additional one-time price:

- Complete Plus Bundle — $39.99 one time; five separate Plus products total $66.95, saving $26.96 (approximately 40% off).

Copy the resulting `pri_...` identifiers into `checkout-portal/paddle-config.js`.

## One-unit purchase limit

Set every one-time Paddle price quantity range to a minimum of `1` and a maximum of `1`. The shared checkout also sends `quantity: 1` explicitly. This prevents a customer from buying multiple units of the same price in one checkout. It does not prevent a customer from starting separate checkouts, so production fulfillment must deduplicate completed transactions before issuing an entitlement.

## One shared checkout portal

There is one payment surface at `/checkout-portal/`. Every product and plan routes there with explicit query parameters:

- `/checkout-portal/index.html?product=ledgerlift&plan=standard`
- `/checkout-portal/index.html?product=ledgerlift&plan=plus`
- `/checkout-portal/index.html?product=pixelport&plan=standard`
- `/checkout-portal/index.html?product=pixelport&plan=plus`
- `/checkout-portal/index.html?product=contactcraft&plan=standard`
- `/checkout-portal/index.html?product=contactcraft&plan=plus`
- `/checkout-portal/index.html?product=calendarflow&plan=standard`
- `/checkout-portal/index.html?product=calendarflow&plan=plus`
- `/checkout-portal/index.html?product=captionshift&plan=standard`
- `/checkout-portal/index.html?product=captionshift&plan=plus`
- `/checkout-portal/index.html?product=suite&plan=bundle`

The official public comparison page is `/pricing.html`. It links to the same shared portal and identifies the exact product, plan, one-time price, and current feature status before checkout.

## Client-side token

Create a Paddle client-side token and paste it into `checkout-portal/paddle-config.js`. Client-side tokens are intended for frontend code. Never put a Paddle API key, webhook secret, password, or private signing key into the website files.

Keep `environment: "sandbox"` and a `test_...` token during this verification phase. Sandbox checkout is now enabled for end-to-end testing only. Do not switch to production or use a `live_...` token. Return `checkoutEnabled` to `false` after testing until the complete fulfillment and launch review is approved.

## Payment methods

In Paddle Checkout settings, enable the payment methods offered for your account. Paddle decides which methods to display based on device, location, and currency. Apple Pay requires HTTPS and works only on compatible Apple devices/browsers. Domain verification is recommended.

## Separate URLs

The cheapest recommended structure is one domain with six distinct links:

- `https://yourdomain.com/ledgerlift/`
- `https://yourdomain.com/pixelport/`
- `https://yourdomain.com/contactcraft/`
- `https://yourdomain.com/calendarflow/`
- `https://yourdomain.com/captionshift/`
- `https://yourdomain.com/checkout-portal/`

Each product is a separate homepage and link, while sharing one domain and checkout. You may later use subdomains such as `ledgerlift.yourdomain.com`; update each `checkout-config.js` to point to the public checkout URL.

## Secure fulfillment is mandatory

A successful browser redirect is not proof of payment. Before automatically unlocking paid features:

1. Create a Paddle webhook destination for `transaction.completed`.
2. Verify every `Paddle-Signature` against the raw request body and the webhook secret.
3. Reject stale timestamps and duplicate event IDs.
4. Map the completed Paddle price ID to the purchased product and plan.
5. Issue a server-signed entitlement or license.
6. Never store the webhook secret, API key, or license-signing private key in frontend files.

The included success page deliberately does not unlock anything. This prevents people from obtaining paid access by visiting a success URL manually.

## Public verification pages

The public verification surface is `/pricing.html`, `/terms.html`, `/privacy.html`, `/refunds.html`, `/refund-request.html`, `/contact.html`, and `/support.html`. Customer support is [localfiletools.support@gmail.com](mailto:localfiletools.support@gmail.com). `/checkout-portal/purchase-success.html` is a confirmation page only; it does not grant access.

Support and refund forms are delivered by the existing Worker and are documented in `SUPPORT_EMAIL_SETUP.md`. Until a provider is configured and tested, they show setup mode and a direct mail fallback; they do not falsely report delivery.

## Privacy boundary

Converter pages do not load Paddle. They keep `connect-src 'none'`, block third-party scripts, and process files locally. Only the separate checkout portal communicates with Paddle. This prevents payment scripts from accessing selected files.
