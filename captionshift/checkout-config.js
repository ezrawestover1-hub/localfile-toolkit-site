// Payment links stay on a separate portal so Paddle never loads beside private files.
// For separate-domain deployment, replace the relative path with your public checkout URL,
// for example: https://buy.yourdomain.com/?product=captionshift&plan=standard
const CHECKOUT_PORTAL = "../checkout-portal/index.html";
window.PRODUCT_CHECKOUTS = Object.freeze({
  standard: `${CHECKOUT_PORTAL}?product=captionshift&plan=standard`,
  plus: `${CHECKOUT_PORTAL}?product=captionshift&plan=plus`,
  bundle: `${CHECKOUT_PORTAL}?product=suite&plan=bundle`
});
