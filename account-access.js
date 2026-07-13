(() => {
  "use strict";
  const products = Object.freeze({ ledgerlift: "LedgerLift", pixelport: "PixelPort", contactcraft: "ContactCraft", calendarflow: "CalendarFlow", captionshift: "CaptionShift" });
  const productHome = (product) => `/${product}/index.html`;
  const planRank = { standard: 1, plus: 2 };

  function entitlementMap(items) {
    const map = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (!products[item.product_key] || !planRank[item.plan_key]) return;
      const previous = map.get(item.product_key);
      if (!previous || planRank[item.plan_key] > planRank[previous.plan_key]) map.set(item.product_key, item);
    });
    return map;
  }

  function isBundleOwner(map) { return Object.keys(products).every((product) => map.get(product)?.plan_key === "plus"); }
  function accessLabel(product, plan) { return `Access ${products[product]}${plan === "plus" ? " Plus" : ""}`; }

  function makeAccessButton(element, label, target) {
    element.textContent = label;
    element.dataset.accountAccessApplied = "true";
    if (element.dataset.checkout) delete element.dataset.checkout;
    if (element.tagName === "A") element.href = target;
    else { element.type = "button"; element.addEventListener("click", () => location.assign(target), { once: true }); }
  }

  function apply(map) {
    const paid = map.size > 0;
    document.querySelectorAll("a[href*='product=suite'], .bundle-menu-button, [data-checkout='bundle'], .product-bundle-card").forEach((element) => {
      if (!paid || element.dataset.accountAccessApplied === "true") return;
      makeAccessButton(element, "Access other products", "/account/");
    });
    const currentProduct = document.body.dataset.product;
    document.querySelectorAll("a[href*='checkout-portal/index.html?product='], [data-checkout]:not([data-checkout='bundle'])").forEach((element) => {
      if (element.dataset.accountAccessApplied === "true") return;
      let product = currentProduct;
      let plan = element.dataset.checkout || "";
      const match = (element.getAttribute("href") || "").match(/product=(ledgerlift|pixelport|contactcraft|calendarflow|captionshift)&plan=(standard|plus)/);
      if (match) [, product, plan] = match;
      if (!map.has(product) || !planRank[plan] || planRank[map.get(product).plan_key] < planRank[plan]) return;
      makeAccessButton(element, accessLabel(product, plan), productHome(product));
    });
    if (paid && !document.querySelector("a.account-access-link")) {
      const nav = document.querySelector(".suite-nav, .nav");
      if (nav) { const link = document.createElement("a"); link.href = "/account/"; link.textContent = "My products"; link.className = "account-access-link"; nav.append(link); }
    }
  }

  fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((account) => { if (account?.authenticated) apply(entitlementMap(account.entitlements)); })
    .catch(() => {});
})();
