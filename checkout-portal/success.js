(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const product = params.get("product");
  const plan = params.get("plan");
  const allowed = new Set(["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"]);
  const names = { ledgerlift: "LedgerLift", pixelport: "PixelPort", contactcraft: "ContactCraft", calendarflow: "CalendarFlow", captionshift: "CaptionShift" };
  const productPath = allowed.has(product) ? `../${product}/index.html` : "../index.html";
  const premiumPath = allowed.has(product) && plan === "plus" ? `/${product}/index.html?mode=plus` : productPath;
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
    productLink.href = premiumPath;
    productLink.textContent = allowed.has(product) && plan === "plus" ? `View ${names[product]} Plus →` : "Return to the product →";
  }
  const accountLink = document.querySelector("a.button[href*='account/register']");
  if (accountLink) {
    const target = new URL("../account/register.html", location.href);
    target.searchParams.set("purchase", "complete");
    if (allowed.has(product) && plan === "plus") target.searchParams.set("next", premiumPath);
    accountLink.href = target.href;
    accountLink.textContent = allowed.has(product) && plan === "plus" ? `Create your account to unlock ${names[product]} Plus` : "Create your account to unlock access";
  }
})();
