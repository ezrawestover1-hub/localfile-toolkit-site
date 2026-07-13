(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const product = params.get("product");
  const plan = params.get("plan");
  const allowed = new Set(["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"]);
  const names = { ledgerlift: "LedgerLift", pixelport: "PixelPort", contactcraft: "ContactCraft", calendarflow: "CalendarFlow", captionshift: "CaptionShift" };
  const bundlePurchase = product === "suite" && plan === "bundle";
  const productPath = allowed.has(product) ? `../${product}/index.html` : "../index.html";
  const paidPath = bundlePurchase ? "/account/" : allowed.has(product) && plan === "plus" ? `/${product}/index.html?mode=plus` : allowed.has(product) && plan === "standard" ? `/${product}/index.html?mode=standard` : productPath;
  const icons = document.getElementById("productEmblems");
  const keys = product === "suite" ? Object.keys(window.PRODUCT_ICONS) : allowed.has(product) ? [product] : [];
  keys.forEach((key) => {
    const item = window.PRODUCT_ICONS[key];
    if (!item || !icons) return;
    const image = document.createElement("img");
    image.src = item.icon;
    image.width = 48;
    image.height = 48;
    image.alt = item.name;
    icons.append(image);
  });
  const productLink = document.getElementById("productLink");
  if (productLink) {
    productLink.href = paidPath;
    productLink.textContent = bundlePurchase ? "Open your account →" : allowed.has(product) && plan === "plus" ? `View ${names[product]} Plus →` : allowed.has(product) && plan === "standard" ? `View ${names[product]} Standard →` : "Return to the product →";
  }
  const accountLink = document.querySelector("a.button[href*='account/register']");
  if (accountLink) {
    const target = new URL("../account/register.html", location.href);
    target.searchParams.set("purchase", "complete");
    if ((allowed.has(product) && ["standard", "plus"].includes(plan)) || bundlePurchase) target.searchParams.set("next", paidPath);
    accountLink.href = target.href;
    accountLink.textContent = bundlePurchase ? "Create your account to unlock the complete bundle" : allowed.has(product) && ["standard", "plus"].includes(plan) ? `Create your account to unlock ${names[product]} ${plan === "plus" ? "Plus" : "Standard"}` : "Create your account to unlock access";
  }

  async function handoffAuthenticatedBuyer() {
    if (!((allowed.has(product) && ["standard", "plus"].includes(plan)) || bundlePurchase)) return;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;
      const account = await response.json().catch(() => ({}));
      if (!account.authenticated) return;
      await import("../license.js").then((license) => license.restoreEntitlements()).catch(() => null);
      const bundleOwned = account.bundle === true || (account.entitlements || []).some((item) => item.product_key === "suite" && item.plan_key === "bundle");
      const productOwned = (account.entitlements || []).some((item) => item.product_key === product && ["standard", "plus"].includes(item.plan_key) && (plan === "standard" || item.plan_key === "plus"));
      if ((bundlePurchase && bundleOwned) || (!bundlePurchase && productOwned)) {
        location.replace(paidPath);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  handoffAuthenticatedBuyer();
})();
