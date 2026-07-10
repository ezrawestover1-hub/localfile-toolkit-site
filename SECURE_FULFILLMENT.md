# Secure fulfillment blueprint

The payment UI is integrated, but automated licensing must be server-side.

Recommended low-cost stack:

- Static suite: Cloudflare Pages, Netlify, or Vercel free tier
- Checkout: Paddle Checkout
- Webhook endpoint: Cloudflare Worker or another serverless function
- Entitlement storage: Cloudflare D1/KV, Supabase, or another minimal database
- License delivery: transactional email provider or a buyer claim page

Webhook rules:

- Read the raw request body before JSON parsing.
- Verify the `Paddle-Signature` HMAC-SHA256 using the destination secret.
- Apply a short timestamp tolerance to reduce replay attacks.
- Store each webhook event ID and process it only once.
- Fulfill only `transaction.completed` events.
- Use the line-item price ID—not user-supplied query parameters—to determine the entitlement.
- Keep API keys and secrets only in encrypted environment variables.
- Log transaction IDs and outcome, never card information.

Do not unlock a plan from `checkout.completed` JavaScript alone. Browser events and success URLs can be manipulated.
