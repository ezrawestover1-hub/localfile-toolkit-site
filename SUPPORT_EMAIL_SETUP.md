# Support email setup

The public support recipient is `localfiletools.support@gmail.com`. Contact and refund forms submit to the Worker at `/api/contact` and `/api/refund-request`; they never contain provider credentials.

The Worker uses a small provider abstraction with these Cloudflare bindings:

- `SUPPORT_RECIPIENT_EMAIL=localfiletools.support@gmail.com`
- `SUPPORT_EMAIL_API_URL` — provider endpoint accepting `{from,to,subject,text}` JSON
- `SUPPORT_EMAIL_API_KEY` — secret API key
- `SUPPORT_EMAIL_FROM_ADDRESS` — verified sender address, for example `LocalFile Toolkit <noreply@example.com>`

Set local values in an untracked `.dev.vars` file and production values with `wrangler secret put`. Never commit a real API key. The example configuration is intentionally non-functional and uses a placeholder endpoint.

Until all provider values are configured, the API returns setup mode with a generic message and the frontend directs the user to [localfiletools.support@gmail.com](mailto:localfiletools.support@gmail.com). It must not claim delivery. Test the provider endpoint with a non-sensitive test submission before enabling production delivery.

The Worker includes an in-memory development rate limit and an optional `RATE_LIMITER` binding hook. Configure a durable Cloudflare rate limiter or equivalent edge control before launch.
