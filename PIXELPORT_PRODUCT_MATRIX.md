# PixelPort product matrix

This is the PixelPort-specific access contract for the current implementation. Prices come from `pricing-config.js`; checkout benefits come from `checkout-portal/checkout.js`; core processing is in `pixelport/app.js`; Plus controls are in `pixelport/plus.js`.

| Access state | Supported workflow | Limits and controls |
| --- | --- | --- |
| Free / unpaid | One local image conversion at a time with PNG, JPG/JPEG, WebP, and AVIF input/output when the browser can decode and encode them; source preview; width/height controls; applicable quality and background controls | One complete real-image export per browser installation, one image per conversion, 20 MB maximum per file, and browser-dependent format support. Sample mode remains available and does not consume the real-image allowance. |
| PixelPort Standard | Everything in the free core workflow | Unlimited single-image conversions, still limited to 20 MB per file and one image per conversion. Standard does not include batch queue, saved presets, filename rules, custom background controls, or target-size web optimization. |
| PixelPort Plus | Everything in Standard | Existing Plus controls: batch image queue, reusable local presets, filename prefix/suffix, transparent/white/black/custom backgrounds, and target-size web optimization for lossy output formats. Each queued file remains subject to the 20 MB browser-side check. No numeric batch quota, history retention, metadata preservation, or server-side image storage is promised. |
| Complete Plus Bundle | PixelPort Plus is included | The bundle also grants Plus entitlements for LedgerLift, ContactCraft, CalendarFlow, and CaptionShift. It is represented by a distinct `suite / bundle` entitlement and is not inferred from owning five individual products. |

## Entitlement rules

- PixelPort resolves independently to `free`, `standard`, or `plus`; another applet's entitlement does not change that result.
- The Worker filters inactive and revoked records before producing `products.pixelport`; a bundle resolves PixelPort to Plus.
- Standard and Plus routes require a verified product-specific entitlement or bundle entitlement. Local browser processing has no remote conversion API or stored image-history endpoint to protect.
- Saved Plus presets remain in the current browser. They are not presented as cross-device history or server-backed storage.
- Quality is meaningful primarily for JPG, WebP, and AVIF. PNG remains lossless and browsers may ignore the quality value.
- Browser decoder/encoder support controls whether a requested source or output format works. PixelPort reports conversion failures instead of uploading the file to a fallback service.

## Known product-definition blockers

- Checkout remains disabled in the supervised sandbox configuration.
- No product-defined numeric batch limit, metadata-retention promise, history-retention promise, or server-side image-processing API exists in the current sources of truth.
