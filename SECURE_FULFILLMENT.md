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
- In production, require `CF-Connecting-IP` to match the current IPv4 `/32`
  list returned by `https://api.paddle.com/ips`; refresh the list periodically
  rather than hard-coding Paddle's addresses. HMAC verification remains required.
- Store each webhook event ID and process it only once; `processing` and `failed` events must remain retryable.
- Fulfill only server-mapped `transaction.completed` events, and handle approved `adjustment.created`/`adjustment.updated` events to revoke or restore access.
- Keep a durable per-customer/product/plan purchase guard so a second transaction cannot issue another active entitlement or activation code.
- Treat full refunds and chargebacks as access revocations. Replays are safe, and a confirmed supported reversal can restore the matching revoked access.
- Use the line-item price ID—not user-supplied query parameters—to determine the entitlement.
- Keep API keys and secrets only in encrypted environment variables.
- Log transaction IDs and outcome, never card information.

Do not unlock a plan from `checkout.completed` JavaScript alone. Browser events and success URLs can be manipulated.
