# Account and cross-device access

The suite now has one passwordless account at `/account/login.html` and a My Account page at `/account/`. The account is keyed to the email used at Paddle checkout. Successful Paddle webhooks attach the purchase to that email, and signing in on a new device restores signed entitlements for that installation.

## Deploy steps

1. Apply the migration:

   `npx wrangler d1 migrations apply localfile-toolkit-licenses --remote`

2. Configure a transactional email provider and set these Worker secrets:

   - `AUTH_EMAIL_API_URL`
   - `AUTH_EMAIL_API_KEY`
   - `AUTH_EMAIL_FROM_ADDRESS`

3. Set `PADDLE_API_KEY` as a Worker secret. It must have the Paddle `customer_portal_session.write` permission. `PADDLE_API_BASE_URL` is set to the sandbox API URL in `wrangler.jsonc`; change it only during a deliberate live rollout.

4. Confirm the Paddle checkout email is the same email the customer uses to sign in.

The site never stores full payment-card details. “Manage billing in Paddle” creates a fresh, short-lived hosted Paddle customer-portal session so customers can view invoices, update payment methods, and manage billing. Portal links must not be cached.

One-time entitlements are durable in D1. Login sessions expire and can be renewed by requesting another email link; expiration of a session does not remove a purchase.
