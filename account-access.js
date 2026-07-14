(() => {
  "use strict";
  const products = Object.freeze({ ledgerlift: "LedgerHarbor", pixelport: "PixelRefinery", contactcraft: "ContactCraft", calendarflow: "CalendarFlow", captionshift: "CaptionShift" });
  const productHome = (product) => `/${product}/index.html`;
  const standardHome = (product) => `${productHome(product)}?mode=standard`;
  const plusHome = (product) => `${productHome(product)}?mode=plus`;
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
    const active = Array.isArray(items) ? items.filter((item) => item?.status === undefined || item.status === "active") : [];
    map.bundleActive = active.some((item) => item.product_key === "suite" && item.plan_key === "bundle");
    map.hasPurchase = map.bundleActive;
    active.forEach((item) => {
      if (!products[item.product_key] || !planRank[item.plan_key]) return;
      const previous = map.get(item.product_key);
      if (!previous || planRank[item.plan_key] > planRank[previous.plan_key]) map.set(item.product_key, item);
      map.hasPurchase = true;
    });
    return map;
  }

  function isBundleOwner(map) { return map.bundleActive === true; }
  function productEntitlement(map, product) {
    if (map.bundleActive) return { product_key: product, plan_key: "plus", source: "bundle" };
    return map.get(product) || null;
  }
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
    const entitlement = productEntitlement(map, product);
    if (!entitlement || document.body.classList.contains("plus-mode") || document.querySelector(".account-access-strip")) return;
    const plus = entitlement.plan_key === "plus";
    const strip = document.createElement("section");
    strip.className = `account-access-strip ${plus ? "is-plus" : "is-standard"}`;
    strip.setAttribute("aria-label", `${products[product]} account access`);
    const content = document.createElement("div");
    content.className = "account-access-strip-content";
    const title = document.createElement("strong");
    title.textContent = `${products[product]} ${plus ? "Plus" : "Standard"} active`;
    const detail = document.createElement("span");
    detail.textContent = entitlement.source === "bundle" ? `${products[product]} Plus is included with your complete toolkit.` : plus ? "All Plus controls are unlocked for this product." : "Core conversion is active. Upgrade when you need the Plus workflow.";
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
    const entitlement = productEntitlement(map, product);
    if (!entitlement) return;
    const standard = document.querySelector("#standard-plan [data-checkout], #standard-plan a[href*='checkout-portal']");
    const plus = document.querySelector("#plus-plan [data-checkout], #plus-plan a[href*='checkout-portal']");
    const plan = entitlement.plan_key;
    if (standard) {
      standard.closest("#standard-plan")?.classList.add("account-owned-plan");
      makeAccessButton(standard, plan === "plus" ? "Included in Plus" : `Open ${products[product]} Standard`, standardHome(product));
    }
    if (plus) {
      plus.closest("#plus-plan")?.classList.add(plan === "plus" ? "account-active-plan" : "account-upgrade-plan");
      if (plan === "plus") makeAccessButton(plus, `Open ${products[product]} Plus`, plusHome(product));
      else makeAccessButton(plus, `Upgrade to ${products[product]} Plus`, checkoutHome(product));
    }
    const heading = document.querySelector("#pricing .pricing-head h2");
    const copy = document.querySelector("#pricing .pricing-head .muted");
    if (heading) heading.textContent = plan === "plus" ? `${products[product]} Plus is ready.` : `${products[product]} Standard is active.`;
    if (copy) copy.textContent = plan === "plus" ? "Your Plus controls are unlocked below. Open the workspace and keep every workflow local to this browser." : "Your core converter is unlocked. Upgrade to Plus for the advanced workflow controls listed below.";
  }

  function suppressUnpurchasedPixelPortPromotion(map) {
    if (document.body.dataset.product !== "pixelport" || map.hasPurchase !== true || productEntitlement(map, "pixelport")) return;
    document.body.classList.add("account-product-free");
    document.querySelector("#pricing")?.classList.add("hidden");
    const pricingLink = document.querySelector("a[href='#pricing']");
    if (pricingLink) {
      pricingLink.href = "../pricing.html";
      pricingLink.textContent = "Plans";
    }
  }

  function suppressUnpurchasedContactCraftPromotion(map) {
    if (document.body.dataset.product !== "contactcraft" || map.hasPurchase !== true || productEntitlement(map, "contactcraft")) return;
    document.body.classList.add("account-product-free");
    document.querySelector("#pricing")?.classList.add("hidden");
    const pricingLink = document.querySelector("a[href='#pricing']");
    if (pricingLink) {
      pricingLink.href = "../pricing.html";
      pricingLink.textContent = "Plans";
    }
  }

  function suppressUnpurchasedCalendarFlowPromotion(map) {
    if (document.body.dataset.product !== "calendarflow" || map.hasPurchase !== true || productEntitlement(map, "calendarflow")) return;
    document.body.classList.add("account-product-free");
    document.querySelector("#pricing")?.classList.add("hidden");
    const pricingLink = document.querySelector("a[href='#pricing']");
    if (pricingLink) {
      pricingLink.href = "../pricing.html";
      pricingLink.textContent = "Plans";
    }
  }

  function suppressUnpurchasedCaptionShiftPromotion(map) {
    if (document.body.dataset.product !== "captionshift" || map.hasPurchase !== true || productEntitlement(map, "captionshift")) return;
    document.body.classList.add("account-product-free");
    document.querySelector("#pricing")?.classList.add("hidden");
    const pricingLink = document.querySelector("a[href='#pricing']");
    if (pricingLink) {
      pricingLink.href = "../pricing.html";
      pricingLink.textContent = "Plans";
    }
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
      document.querySelectorAll(".suite-card").forEach((card) => {
        const match = (card.getAttribute("href") || "").match(/\/(ledgerlift|pixelport|contactcraft|calendarflow|captionshift)\//);
        if (match) card.href = plusHome(match[1]);
        const label = card.querySelector("b");
        if (label) label.textContent = label.textContent.replace(/^Open /, "Open Plus ");
      });
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
        if (bundleCopy) bundleCopy.textContent = "LedgerHarbor, PixelRefinery, ContactCraft, CalendarFlow, and CaptionShift are all connected to your account. No second purchase is needed.";
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
      const entitlement = productEntitlement(map, product);
      const label = card.querySelector("b");
      if (label) label.textContent = entitlement ? `Open ${entitlement.plan_key === "plus" ? "Plus " : ""}${products[product]} →` : `Explore ${products[product]} →`;
      if (entitlement) card.href = entitlement.plan_key === "plus" ? plusHome(product) : standardHome(product);
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
    const paid = map.hasPurchase === true;
    const fullPlus = isBundleOwner(map);
    const currentProduct = document.body.dataset.product;
    const plusMode = new URLSearchParams(location.search).get("mode") === "plus";
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
      const entitlement = productEntitlement(map, product);
      if (!entitlement || !planRank[plan] || planRank[entitlement.plan_key] < planRank[plan]) return;
      makeAccessButton(element, accessLabel(product, plan), plan === "plus" ? plusHome(product) : standardHome(product));
    });
    if (paid) {
      if (currentProduct) {
        document.querySelector("a.account-access-link")?.remove();
        const entitlement = productEntitlement(map, currentProduct);
        if (currentProduct === "pixelport") {
          window.SuiteGate?.setTier?.(entitlement?.plan_key || "free", entitlement?.source);
          suppressUnpurchasedPixelPortPromotion(map);
        }
        if (currentProduct === "contactcraft") {
          window.SuiteGate?.setTier?.(entitlement?.plan_key || "free", entitlement?.source);
          suppressUnpurchasedContactCraftPromotion(map);
        }
        if (currentProduct === "calendarflow") {
          window.SuiteGate?.setTier?.(entitlement?.plan_key || "free", entitlement?.source);
          suppressUnpurchasedCalendarFlowPromotion(map);
        }
        if (currentProduct === "captionshift") {
          window.SuiteGate?.setTier?.(entitlement?.plan_key || "free", entitlement?.source);
          suppressUnpurchasedCaptionShiftPromotion(map);
        }
        if (!plusMode) {
          addAccessStrip(map, currentProduct);
          applyProductPricing(map, currentProduct);
        }
      } else {
        if (document.querySelector(".suite-bundle-link")) document.querySelector("a.account-access-link")?.remove();
        else addAccountLink();
        applySuiteHome(map, fullPlus);
      }
    }
  }

  loadStylesheet();
  addAccountLink();
  function routeOwnedLedgerLift(map, account) {
    const path = location.pathname.replace(/\/+$/, "");
    const isLedgerLiftHome = /\/ledgerlift(?:\/index\.html)?$/.test(path);
    const mode = new URLSearchParams(location.search).get("mode");
    if (!isLedgerLiftHome || mode === "standard" || mode === "plus") return;
    const serverTier = ["free", "standard", "plus"].includes(account?.highestLedgerLiftTier) ? account.highestLedgerLiftTier : productEntitlement(map, "ledgerlift")?.plan_key || "free";
    if (serverTier === "free") return;
    location.replace(`${productHome("ledgerlift")}?mode=${serverTier}`);
  }

  function routeOwnedPixelPort(map, account) {
    const path = location.pathname.replace(/\/+$/, "");
    const isPixelPortHome = /\/pixelport(?:\/index\.html)?$/.test(path);
    const mode = new URLSearchParams(location.search).get("mode");
    if (!isPixelPortHome || mode === "standard" || mode === "plus") return;
    const serverTier = ["free", "standard", "plus"].includes(account?.products?.pixelport) ? account.products.pixelport : productEntitlement(map, "pixelport")?.plan_key || "free";
    if (serverTier === "free") return;
    location.replace(`${productHome("pixelport")}?mode=${serverTier}`);
  }

  function routeOwnedContactCraft(map, account) {
    const path = location.pathname.replace(/\/+$/, "");
    const isContactCraftHome = /\/contactcraft(?:\/index\.html)?$/.test(path);
    const mode = new URLSearchParams(location.search).get("mode");
    if (!isContactCraftHome || mode === "standard" || mode === "plus") return;
    const serverTier = ["free", "standard", "plus"].includes(account?.products?.contactcraft) ? account.products.contactcraft : productEntitlement(map, "contactcraft")?.plan_key || "free";
    if (serverTier === "free") return;
    location.replace(`${productHome("contactcraft")}?mode=${serverTier}`);
  }

  function routeOwnedCalendarFlow(map, account) {
    const path = location.pathname.replace(/\/+$/, "");
    const isCalendarFlowHome = /\/calendarflow(?:\/index\.html)?$/.test(path);
    const mode = new URLSearchParams(location.search).get("mode");
    if (!isCalendarFlowHome || mode === "standard" || mode === "plus") return;
    const serverTier = ["free", "standard", "plus"].includes(account?.products?.calendarflow) ? account.products.calendarflow : productEntitlement(map, "calendarflow")?.plan_key || "free";
    if (serverTier === "free") return;
    location.replace(`${productHome("calendarflow")}?mode=${serverTier}`);
  }

  function routeOwnedCaptionShift(map, account) {
    const path = location.pathname.replace(/\/+$/, "");
    const isCaptionShiftHome = /\/captionshift(?:\/index\.html)?$/.test(path);
    const mode = new URLSearchParams(location.search).get("mode");
    if (!isCaptionShiftHome || mode === "standard" || mode === "plus") return;
    const serverTier = ["free", "standard", "plus"].includes(account?.products?.captionshift) ? account.products.captionshift : productEntitlement(map, "captionshift")?.plan_key || "free";
    if (serverTier === "free") return;
    location.replace(`${productHome("captionshift")}?mode=${serverTier}`);
  }

  fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((account) => { if (account?.authenticated) { const map = entitlementMap(account.entitlements); routeOwnedLedgerLift(map, account); routeOwnedPixelPort(map, account); routeOwnedContactCraft(map, account); routeOwnedCalendarFlow(map, account); routeOwnedCaptionShift(map, account); apply(map); } })
    .catch(() => {});
})();
