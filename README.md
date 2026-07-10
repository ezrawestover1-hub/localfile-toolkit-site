# LocalFile Tools

Five static, privacy-first converter website prototypes:

1. LedgerLift — CSV to IIF
2. PixelPort — PNG/JPG/WebP/AVIF
3. ContactCraft — VCF/vCard and CSV
4. CalendarFlow — ICS/iCalendar and CSV
5. CaptionShift — SRT/VTT/SBV/ASS

## Pricing built into every site

- One complete document free
- Standard: $9.99 one time
- Plus: $11.99 one time
- Five-product Plus bundle: $39.99 one time

## Important before launch

- Configure the single shared `/checkout-portal/` with Paddle sandbox values only; all eleven purchase choices use that portal. The public comparison page is `/pricing.html`.
- Configure the Phase 1 server-verified licensing backend described in [LICENSING_SETUP.md](LICENSING_SETUP.md) before launch. The current browser demo flag is privacy-friendly but is not strong anti-piracy.
- Review the public [terms](terms.html), [privacy](privacy.html), [refund](refunds.html), [contact](contact.html), and [support](support.html) pages before launch. Customer support is [localfiletools.support@gmail.com](mailto:localfiletools.support@gmail.com).
- Complete operator identity, contact email, refunds, taxes and final legal terms.
- Test each converter with diverse real-world files. These are production-oriented prototypes, not certified universal format implementations.
- For separate domains, replace relative product links with final public URLs.

## Security

The converters include strict CSP and hosting header files, no analytics, no remote scripts and connect-src 'none'. File contents are processed locally. Hosting providers may still keep normal HTTP request logs.


## Payment integration

A dedicated Paddle checkout portal is included at `checkout-portal/`. See `PAYMENTS_SETUP.md`. Converter pages remain isolated from all payment scripts and network calls.

The official public pricing page is `/pricing.html`. Contact and refund requests use the Worker endpoints `/api/contact` and `/api/refund-request`; configure the provider described in [SUPPORT_EMAIL_SETUP.md](SUPPORT_EMAIL_SETUP.md) before relying on online delivery. Sandbox checkout remains disabled until licensing, fulfillment, legal review, and email delivery are complete.

## Typography refinement

Bright blue link-style lettering has been removed. Product colors are now reserved for buttons, icons, borders, and large background areas. Ordinary informational text and links use charcoal or muted slate for a calmer, more trustworthy appearance.
