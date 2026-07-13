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

  function addAccountLink() {
    if (document.querySelector("a.account-access-link")) return;
    const nav = document.querySelector(".suite-nav, .nav");
    if (nav) {
      const link = document.createElement("a");
      link.href = "/account/";
      link.textContent = "My Account";
      link.className = "account-access-link";
      nav.append(link);
    }
  }

  function apply(map) {
    const paid = map.size > 0;
    const fullPlus = isBundleOwner(map);
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
    if (paid) addAccountLink();
    if (fullPlus && !currentProduct) {
      document.body.classList.add("account-active");
      const badge = document.querySelector(".hero .badge");
      const heading = document.querySelector(".hero h1");
      const lead = document.querySelector(".hero h1 + p");
      const heroLink = document.querySelector(".hero .button");
      const portalHeading = document.querySelector(".portal-intro h2");
      const portalCopy = document.querySelector(".portal-intro p");
      if (badge) badge.textContent = "Full Plus access active";
      if (heading) heading.textContent = "Your complete private toolkit is ready.";
      if (lead) lead.textContent = "All five Plus products are linked to your account. Open any tool and keep working across devices with permanent one-time access.";
      if (heroLink) { heroLink.textContent = "Open My Account"; heroLink.href = "/account/"; }
      if (portalHeading) portalHeading.textContent = "Open your Plus tools";
      if (portalCopy) portalCopy.textContent = "Every product below is ready with its Plus features. Choose a tool and start working.";
      document.querySelectorAll(".suite-card b").forEach((label) => { label.textContent = label.textContent.replace(/^Open /, "Open Plus "); });
      const bundle = document.querySelector(".bundle");
      if (bundle) {
        const bundleKicker = bundle.querySelector(".bundle-kicker");
        const bundleHeading = bundle.querySelector("h2");
        const bundleStrong = bundle.querySelector("strong");
        const bundleCopy = bundle.querySelector("p");
        const bundleLink = bundle.querySelector("a");
        if (bundleKicker) bundleKicker.textContent = "Your complete suite";
        if (bundleHeading) bundleHeading.textContent = "Full Plus access is active.";
        if (bundleStrong) bundleStrong.textContent = "5 products ready";
        if (bundleCopy) bundleCopy.textContent = "LedgerLift, PixelPort, ContactCraft, CalendarFlow, and CaptionShift are all connected to your account. No second purchase is needed.";
        if (bundleLink) { bundleLink.textContent = "Access other products"; bundleLink.href = "/account/"; }
      }
    }
  }

  addAccountLink();
  fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((account) => { if (account?.authenticated) apply(entitlementMap(account.entitlements)); })
    .catch(() => {});
})();
