# Launch checklist

1. Pick final domains and run trademark/domain checks for every working product name.
2. Replace every relative cross-product link if the sites will live on separate domains.
3. Add Stripe-hosted Payment Links to each checkout-config.js.
4. Build server-verified signed licenses before claiming paid access is enforced.
5. Complete the operator name, support email, refund terms, tax handling and final legal review.
6. Replace YOUR-DOMAIN.example in each sitemap template.
7. Test real-world files from multiple sources for each format.
8. Run each deployed domain through securityheaders.com and Mozilla Observatory.
9. Verify the browser Network panel sends no file data or background requests.
10. Submit sitemaps to Google Search Console and Bing Webmaster Tools.


## Payments

- Create Paddle products and one-time price IDs.
- Add the public client-side token and price IDs to `checkout-portal/paddle-config.js`.
- Approve and verify the public checkout domain.
- Enable Apple Pay, Google Pay, PayPal, and desired regional methods.
- Test all eleven prices in Paddle sandbox.
- Implement a verified `transaction.completed` webhook before automatic license delivery.
- Never unlock access from the browser success URL alone.
