(() => {
  "use strict";
  const products = Object.freeze({ ledgerlift: "LedgerLift", pixelport: "PixelPort", contactcraft: "ContactCraft", calendarflow: "CalendarFlow", captionshift: "CaptionShift" });
  const productHome = (product) => `/${product}/index.html`;
  const checkoutHome = (product) => `/checkout-portal/index.html?product=${product}&plan=plus`;
  const planRank = { standard: 1, plus: 2 };

  function loadStylesheet() {
    if (document.querySelector("link[data-account-access-styles]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = document.body.dataset.product ? "../account-access.css" : "/account-access.css";
    link.dataset.accountAccessStyles = "true";
    document.head.append(link);
  }

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

  function addAccessStrip(map, product) {
    const entitlement = map.get(product);
    if (!entitlement || document.querySelector(".account-access-strip")) return;
    const plus = entitlement.plan_key === "plus";
    const strip = document.createElement("section");
    strip.className = `account-access-strip ${plus ? "is-plus" : "is-standard"}`;
    strip.setAttribute("aria-label", `${products[product]} account access`);
    const content = document.createElement("div");
    content.className = "account-access-strip-content";
    const title = document.createElement("strong");
    title.textContent = `${products[product]} ${plus ? "Plus" : "Standard"} active`;
    const detail = document.createElement("span");
    detail.textContent = plus ? "All Plus controls are unlocked for this product." : "Core conversion is active. Upgrade when you need the Plus workflow.";
    content.append(title, detail);
    const actions = document.createElement("div");
    actions.className = "account-access-strip-actions";
    const account = document.createElement("a");
    account.href = "/account/";
    account.textContent = "My Account";
    actions.append(account);
    const secondary = document.createElement("a");
    secondary.href = plus ? "/account/" : checkoutHome(product);
    secondary.textContent = plus ? "Access other products" : "Upgrade to Plus";
    secondary.className = "secondary";
    actions.append(secondary);
    strip.append(content, actions);
    document.querySelector(".topbar")?.after(strip);
  }

  function applyProductPricing(map, product) {
    const entitlement = map.get(product);
    if (!entitlement) return;
    const standard = document.querySelector("#standard-plan [data-checkout], #standard-plan a[href*='checkout-portal']");
    const plus = document.querySelector("#plus-plan [data-checkout], #plus-plan a[href*='checkout-portal']");
    const plan = entitlement.plan_key;
    if (standard) {
      standard.closest("#standard-plan")?.classList.add("account-owned-plan");
      makeAccessButton(standard, plan === "plus" ? "Included in Plus" : `Open ${products[product]} Standard`, productHome(product));
    }
    if (plus) {
      plus.closest("#plus-plan")?.classList.add(plan === "plus" ? "account-active-plan" : "account-upgrade-plan");
      if (plan === "plus") makeAccessButton(plus, `Open ${products[product]} Plus`, productHome(product));
      else makeAccessButton(plus, `Upgrade to ${products[product]} Plus`, checkoutHome(product));
    }
    const heading = document.querySelector("#pricing .pricing-head h2");
    const copy = document.querySelector("#pricing .pricing-head .muted");
    if (heading) heading.textContent = plan === "plus" ? `${products[product]} Plus is ready.` : `${products[product]} Standard is active.`;
    if (copy) copy.textContent = plan === "plus" ? "Your Plus controls are unlocked below. Open the workspace and keep every workflow local to this browser." : "Your core converter is unlocked. Upgrade to Plus for the advanced workflow controls listed below.";
  }

  function applySuiteHome(map, fullPlus) {
    if (fullPlus) {
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
      return;
    }
    document.body.classList.add("account-active", "account-partial");
    const badge = document.querySelector(".hero .badge");
    const heading = document.querySelector(".hero h1");
    const lead = document.querySelector(".hero h1 + p");
    const heroLink = document.querySelector(".hero .button");
    const portalHeading = document.querySelector(".portal-intro h2");
    const portalCopy = document.querySelector(".portal-intro p");
    if (badge) badge.textContent = "Your account is active";
    if (heading) heading.textContent = "Your purchased tools are ready.";
    if (lead) lead.textContent = "Open the products you own, keep working across devices, and upgrade any product when you need its Plus controls.";
    if (heroLink) { heroLink.textContent = "Open My Account"; heroLink.href = "/account/"; }
    if (portalHeading) portalHeading.textContent = "Open your tools";
    if (portalCopy) portalCopy.textContent = "Purchased products are ready below. Other products and upgrades stay connected through your account.";
    document.querySelectorAll(".suite-card").forEach((card) => {
      const match = (card.getAttribute("href") || "").match(/\/(ledgerlift|pixelport|contactcraft|calendarflow|captionshift)\//);
      if (!match) return;
      const product = match[1];
      const entitlement = map.get(product);
      const label = card.querySelector("b");
      if (label) label.textContent = entitlement ? `Open ${entitlement.plan_key === "plus" ? "Plus " : ""}${products[product]} →` : `Explore ${products[product]} →`;
      card.dataset.accessState = entitlement?.plan_key || "unowned";
    });
    const bundle = document.querySelector(".bundle");
    if (bundle) {
      const ready = map.size;
      const bundleKicker = bundle.querySelector(".bundle-kicker");
      const bundleHeading = bundle.querySelector("h2");
      const bundleStrong = bundle.querySelector("strong");
      const bundleCopy = bundle.querySelector("p");
      const bundleLink = bundle.querySelector("a");
      if (bundleKicker) bundleKicker.textContent = "Your account";
      if (bundleHeading) bundleHeading.textContent = "Keep building your toolkit.";
      if (bundleStrong) bundleStrong.textContent = `${ready} product${ready === 1 ? "" : "s"} ready`;
      if (bundleCopy) bundleCopy.textContent = "Use your account to open purchased tools, restore access on another device, and explore the products you have not added yet.";
      if (bundleLink) { bundleLink.textContent = "Access other products"; bundleLink.href = "/account/"; }
    }
  }

  function apply(map) {
    const paid = map.size > 0;
    const fullPlus = isBundleOwner(map);
    const currentProduct = document.body.dataset.product;
    document.querySelectorAll("a[href*='product=suite'], .bundle-menu-button, [data-checkout='bundle'], .product-bundle-card").forEach((element) => {
      if (!paid || element.dataset.accountAccessApplied === "true") return;
      const isSuiteHeader = !currentProduct && element.classList.contains("suite-bundle-link");
      makeAccessButton(element, isSuiteHeader ? "My Account" : "Access other products", "/account/");
    });
    document.querySelectorAll("a[href*='checkout-portal/index.html?product='], [data-checkout]:not([data-checkout='bundle'])").forEach((element) => {
      if (element.dataset.accountAccessApplied === "true") return;
      let product = currentProduct;
      let plan = element.dataset.checkout || "";
      const match = (element.getAttribute("href") || "").match(/product=(ledgerlift|pixelport|contactcraft|calendarflow|captionshift)&plan=(standard|plus)/);
      if (match) [, product, plan] = match;
      if (!map.has(product) || !planRank[plan] || planRank[map.get(product).plan_key] < planRank[plan]) return;
      makeAccessButton(element, accessLabel(product, plan), productHome(product));
    });
    if (paid) {
      if (currentProduct) {
        document.querySelector("a.account-access-link")?.remove();
        addAccessStrip(map, currentProduct);
        applyProductPricing(map, currentProduct);
      } else {
        if (document.querySelector(".suite-bundle-link")) document.querySelector("a.account-access-link")?.remove();
        else addAccountLink();
        applySuiteHome(map, fullPlus);
      }
    }
  }

  loadStylesheet();
  addAccountLink();
  fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((account) => { if (account?.authenticated) apply(entitlementMap(account.entitlements)); })
    .catch(() => {});
})();
