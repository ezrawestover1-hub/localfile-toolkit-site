# Paddle payment setup

The suite is prepared for Paddle Checkout, but it cannot take real money until you create your own Paddle account and insert your public configuration values.

## Why Paddle

Paddle can present cards, Apple Pay, Google Pay, PayPal, and regional methods from one checkout. It acts as merchant of record for supported sales and handles indirect tax calculation/remittance, fraud, chargebacks, compliant receipts, and billing support.

## Catalog to create

Create these one-time products/prices in Paddle:

| Product | Standard | Plus |
|---|---:|---:|
| LedgerLift | $9.99 | $11.99 |
| PixelPort | $9.99 | $11.99 |
| ContactCraft | $9.99 | $11.99 |
| CalendarFlow | $9.99 | $11.99 |
| CaptionShift | $9.99 | $11.99 |

Create one additional one-time price:

- LocalFile Tools Plus Bundle — $39.99

Copy the resulting `pri_...` identifiers into `checkout-portal/paddle-config.js`.

## Client-side token

Create a Paddle client-side token and paste it into `checkout-portal/paddle-config.js`. Client-side tokens are intended for frontend code. Never put a Paddle API key, webhook secret, password, or private signing key into the website files.

Start with `environment: "sandbox"` and a `test_...` token. After your seller account, website, products, prices, and domain are approved, switch to `environment: "production"` and a `live_...` token.

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

## Privacy boundary

Converter pages do not load Paddle. They keep `connect-src 'none'`, block third-party scripts, and process files locally. Only the separate checkout portal communicates with Paddle. This prevents payment scripts from accessing selected files.
