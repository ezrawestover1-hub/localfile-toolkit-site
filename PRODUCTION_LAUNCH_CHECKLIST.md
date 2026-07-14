# Production launch observation checklist

Use this checklist during a controlled production rollout. It is intentionally
manual where the result depends on a real domain, email provider, Paddle event,
Worker log, or D1 record. Do not mark a payment gate complete from Paddle's
success page alone.

## Public infrastructure

- [ ] `localfiletoolkit.com` resolves to the intended Worker.
- [ ] HTTPS certificate, redirects, HSTS, and the final apex/www decision are correct.
- [ ] No mixed content appears in the browser console.
- [ ] Canonicals use `https://localfiletoolkit.com/`.
- [ ] `https://localfiletoolkit.com/sitemap.xml` loads publicly.
- [ ] `https://localfiletoolkit.com/robots.txt` loads publicly.
- [ ] Every advertising URL returns HTTP 200 without login.
- [ ] Mobile rendering is checked at a narrow phone width.
- [ ] Social previews show the intended product image, title, and description.

## Email and support

- [ ] Registration email is received.
- [ ] Registration verification link/code works once and cannot be replayed.
- [ ] Password-reset email is received.
- [ ] Password-reset link/code works once and a resend path is available.
- [ ] Support email receives a contact submission.
- [ ] Refund request reaches the intended support destination.
- [ ] Sender and reply-to addresses are correct and authenticated.
- [ ] No secrets, full payment details, activation codes, or unnecessary source data appear in email content.

## First Standard purchase observation

- [ ] The intended product and Standard tier are selected.
- [ ] The expected one-time price is shown.
- [ ] Paddle reports a completed transaction.
- [ ] The signed webhook is received and accepted.
- [ ] Fulfillment is idempotent when the webhook is replayed.
- [ ] The correct customer record exists.
- [ ] The correct product entitlement exists.
- [ ] Wrong products remain locked.
- [ ] The account UI reflects the entitlement after refresh/sign-in.
- [ ] The confirmation email is correct.
- [ ] D1 records match the transaction and product/plan.
- [ ] Worker logs contain no sensitive payment information.

## First Plus purchase observation

- [ ] The intended Plus tier is selected.
- [ ] The correct Plus entitlement is granted after the verified webhook.
- [ ] Plus workspace controls appear for the purchased product.
- [ ] Standard functionality remains available.
- [ ] Unpurchased products and unrelated Plus controls remain gated.

## First bundle purchase observation

- [ ] Bundle price is `$39.99` one time.
- [ ] Exactly five product Plus entitlements are created.
- [ ] No duplicate or extra entitlements are created.
- [ ] The account page displays LedgerHarbor, PixelRefinery, ContactCraft, CalendarFlow, and CaptionShift correctly.

## Failure and reversal checks

- [ ] Duplicate webhook delivery does not duplicate fulfillment or activation codes.
- [ ] Duplicate purchase behavior matches the documented one-time license policy.
- [ ] Failed payment grants no access.
- [ ] Cancelled checkout grants no access.
- [ ] Refund handling is observed.
- [ ] Revocation behavior is observed.
- [ ] Chargeback/reversal handling is documented and, where possible, observed.
- [ ] Support can identify a transaction using a Paddle transaction ID without exposing sensitive data.

## Sign-off notes

Record the date, environment, route, transaction IDs, webhook notification IDs,
and the person who observed each production result. Keep credentials and payment
details out of this file.
