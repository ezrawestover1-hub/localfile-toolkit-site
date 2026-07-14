# Account and cross-device access

The suite now has one email-and-password account at `/account/login.html` and a My Account page at `/account/`. The account is keyed to the email used at Paddle checkout. Successful Paddle webhooks attach the purchase to that email, and signing in on a new device restores signed entitlements for that installation.

## Deploy steps

1. Apply the migration:

   `npx wrangler d1 migrations apply localfile-toolkit-licenses --remote`

2. Configure a transactional email provider and set these Worker values:

   - `AUTH_EMAIL_API_URL`
   - `AUTH_EMAIL_API_KEY`
   - `AUTH_EMAIL_FROM_ADDRESS`

   New accounts receive a six-digit verification code by email. Passwords must be at least 8 characters, are stored only as salted PBKDF2-HMAC-SHA-256 hashes in the Worker, and are never emailed or stored in plaintext. Existing legacy HMAC records are upgraded after a successful sign-in. Recent password history is checked so a reset cannot immediately reuse a previous password.

   Verification and reset codes are single-use. Sending a newer code invalidates the previous unused code, each code is limited to five failed attempts, and a short processing lease prevents concurrent requests from completing the same code twice. Replaying a used code returns an invalid-code response and cannot create a session or change a password.

   Apply the new `migrations/0007_auth_hardening.sql` migration to every D1 environment before deploying the Worker code.

3. Set `PADDLE_API_KEY` as a Worker secret. It must have the Paddle `customer_portal_session.write` permission. `PADDLE_API_BASE_URL` is set to the sandbox API URL in `wrangler.jsonc`; change it only during a deliberate live rollout.

4. Confirm the Paddle checkout email is the same email the customer uses to sign in.

The site never stores full payment-card details. “Manage billing in Paddle” creates a fresh, short-lived hosted Paddle customer-portal session so customers can view invoices, update payment methods, and manage billing. Portal links must not be cached.

One-time entitlements are durable in D1. Login sessions expire and can be renewed by signing in again with the account password; expiration of a session does not remove a purchase.
