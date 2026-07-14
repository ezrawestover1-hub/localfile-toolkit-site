(() => {
  "use strict";
  const body = document.body;
  const key = body.dataset.demoKey;
  const product = body.dataset.product;
  const mode = new URLSearchParams(location.search).get("mode");
  const checkout = window.PRODUCT_CHECKOUTS || {};
  const PRODUCT_ICON_REFS = Object.freeze(Object.fromEntries(Object.entries(window.PRODUCT_ICONS || {}).map(([key, item]) => [key, { name: item.name, src: item.icon }])));

  function makeProductIcon(productKey, className = "product-icon-reference") {
    const definition = PRODUCT_ICON_REFS[productKey];
    if (!definition) return null;
    const image = document.createElement("img");
    image.src = definition.src;
    image.alt = "";
    image.width = 36;
    image.height = 36;
    image.className = className;
    image.setAttribute("aria-hidden", "true");
    return image;
  }

  // Keep one canonical product icon per product everywhere it appears: headers,
  // proof blocks, product menus, related-product cards, and checkout links.
  function applyCanonicalProductIcons() {
    const own = PRODUCT_ICON_REFS[product];
    const brand = document.querySelector(".brand");
    if (brand && own) {
      let mark = brand.querySelector(".mark");
      if (!mark) {
        mark = document.createElement("span");
        mark.className = "mark";
        brand.prepend(mark);
      }
      const emblem = makeProductIcon(product, "product-icon");
      if (emblem) mark.replaceChildren(emblem);
    }

    const proofIcon = document.querySelector(".proof-grid > div:first-child .icon");
    if (proofIcon && own) {
      const emblem = makeProductIcon(product, "product-icon");
      if (emblem) proofIcon.replaceChildren(emblem);
    }

    document.querySelectorAll(".product-menu-item").forEach(link => {
      const key = link.dataset.productLink || Object.keys(PRODUCT_ICON_REFS).find(name => {
        const href = link.getAttribute("href") || "";
        return href.includes(`../${name}/`) || href.includes(`/${name}/`);
      });
      if (!key || link.querySelector(".product-icon-reference")) return;
      const emblem = makeProductIcon(key);
      if (!emblem) return;
      link.dataset.iconReady = "true";
      link.prepend(emblem);
    });

    document.querySelectorAll("a.product-card").forEach(link => {
      const href = link.getAttribute("href") || "";
      const key = Object.keys(PRODUCT_ICON_REFS).find(name => href.includes(`../${name}/`) || href.includes(`/${name}/`));
      if (!key || link.querySelector(".product-icon-reference")) return;
      const emblem = makeProductIcon(key);
      if (!emblem) return;
      link.dataset.iconReady = "true";
      link.prepend(emblem);
    });
  }

  let activeRealDocument = false;
  let paidAccess = false;
  let tier = mode === "plus" ? "plus" : mode === "standard" ? "standard" : "free";
  let tierSource = "";
  let toastTimer;
  const $ = (id) => document.getElementById(id);
  const toast = $("toast");
  const dialog = $("upgradeDialog");
  const trial = $("trialStatus");

  function ensurePixelPortTierStatus() {
    if (product !== "pixelport" || !trial || document.querySelector(".product-tier-status")) return;
    const style = document.createElement("style");
    style.textContent = ".product-tier-status{margin:10px 0 0;padding:8px 11px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--primary);font-size:.76rem;font-weight:850;letter-spacing:.04em}.product-tier-status[data-tier=standard]{background:#e4f0ee;color:#1e5c5e;border-color:#9db8b8}.product-tier-status[data-tier=plus],.product-tier-status[data-tier=bundle]{background:#fff7df;color:#76520c;border-color:#dfc778}";
    document.head.append(style);
    const status = document.createElement("div");
    status.className = "product-tier-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    trial.after(status);
  }

  function tierLabel() {
    if (tierSource === "bundle") return "INCLUDED WITH BUNDLE · PixelPort Plus access";
    if (tier === "plus") return "PLUS · PixelPort Plus workspace";
    if (tier === "standard") return "STANDARD · PixelPort Standard workspace";
    return "FREE · 1 image per conversion · 20 MB max · 1 completed export per browser installation";
  }

  function setTier(nextTier = "free", source = "") {
    if (product !== "pixelport") return;
    tier = ["free", "standard", "plus"].includes(nextTier) ? nextTier : "free";
    tierSource = source === "bundle" ? "bundle" : "";
    ensurePixelPortTierStatus();
    const status = document.querySelector(".product-tier-status");
    if (status) { status.dataset.tier = tierSource || tier; status.textContent = tierLabel(); }
    body.dataset.pixelportTier = tier;
    body.dataset.pixelportTierSource = tierSource;
  }

  function applyPixelPortLimitsCopy() {
    if (product !== "pixelport") return;
    const dropHint = document.querySelector("#dropZone small");
    const converterHeading = document.querySelector("#converter .section-title h2");
    const converterCopy = document.querySelector("#converter .section-title p");
    const freeCallout = document.querySelector(".free-demo-callout strong");
    const freeCalloutCopy = document.querySelector(".free-demo-callout");
    const pricingCopy = document.querySelector("#pricing .pricing-head .muted");
    const freeProof = document.querySelector(".proof-grid > div:last-child");
    const upgradeTitle = document.querySelector("#upgradeTitle");
    const upgradeCopy = document.querySelector("#upgradeDialog .dialog-card p");
    if (dropHint) dropHint.textContent = "PNG, JPG, WebP or AVIF · 20 MB maximum · one image per conversion · processed locally";
    if (converterHeading) converterHeading.textContent = "Try one image conversion";
    if (converterCopy) converterCopy.textContent = "Free: one image under 20 MB, one completed export per browser installation, and browser-dependent format support.";
    if (freeCallout) freeCallout.textContent = "One complete image export is free.";
    if (freeCalloutCopy) freeCalloutCopy.lastChild.textContent = " Use the converter above to load, preview, and export one real image before choosing a paid plan.";
    if (pricingCopy) pricingCopy.textContent = "Your first complete image export is free. Paid plans begin only when you need another image.";
    if (freeProof) { freeProof.querySelector("strong")?.replaceChildren(document.createTextNode("One complete image free")); freeProof.querySelector("small")?.replaceChildren(document.createTextNode("Test the actual conversion before paying.")); }
    if (upgradeTitle) upgradeTitle.textContent = "Your free PixelPort image allowance has been used";
    if (upgradeCopy) upgradeCopy.textContent = "Keep converting with PixelPort Standard, or review PixelPort Plus and the complete bundle when you deliberately choose an upgrade.";
  }

  function used() { try { return localStorage.getItem(key) === "used"; } catch { return false; } }
  function markUsed() { try { localStorage.setItem(key, "used"); } catch {} activeRealDocument = true; update(); }
  function mayOpenRealDocument() { return paidAccess || !used() || activeRealDocument; }
  function showUpgrade() { dialog?.classList.remove("hidden"); body.classList.add("dialog-open"); $("closeUpgradeBtn")?.focus(); }
  function closeUpgrade() { dialog?.classList.add("hidden"); body.classList.remove("dialog-open"); }
  function message(text) { if (!toast) return; toast.textContent = text; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove("show"),3200); }
  function checkoutPlan(plan) {
    const url = checkout[plan];
    if (typeof url === "string" && /checkout-portal\/index\.html\?product=(ledgerlift|pixelport|contactcraft|calendarflow|captionshift|suite)&plan=(standard|plus|bundle)/.test(url)) location.assign(url);
    else message(`Secure checkout is not configured yet. Complete the Paddle setup in PAYMENTS_SETUP.md.`);
  }
  function update(sample=false) {
    if (!trial) return;
    ensurePixelPortTierStatus();
    if (paidAccess) trial.textContent = mode === "plus" ? "Plus access is active. Real files are available without the free-document limit." : "Standard access is active. Core conversions are available without the free-document limit.";
    else if (product === "pixelport" && sample) trial.textContent = "Sample mode does not consume your free image allowance.";
    else if (product === "pixelport" && used() && activeRealDocument) trial.textContent = "Free image active: you may export this open image again. A new image requires a paid license.";
    else if (product === "pixelport" && used()) trial.textContent = "Free image allowance used: choose Standard, Plus, or the five-product bundle to continue.";
    else if (product === "pixelport") trial.textContent = "Free demo: one image under 20 MB and one completed export per browser installation.";
    else if (sample) trial.textContent = "Sample mode does not consume your free document.";
    else if (used() && activeRealDocument) trial.textContent = "Free document active: you may export this open document again. A new document requires a paid license.";
    else if (used()) trial.textContent = "Free document used: choose Standard, Plus, or the five-product bundle to continue.";
    else trial.textContent = "Free demo: convert and export one complete document.";
    setTier(tier, tierSource);
  }
  function addSiteLinks() {
    const footer = document.querySelector(".footer");
    if (!footer || footer.querySelector(".site-wide-links")) return;
    const nav = document.createElement("nav");
    nav.className = "site-wide-links";
    nav.setAttribute("aria-label", "Site links");
    [["Pricing","../pricing.html"],["Contact","../contact.html"],["Terms","../terms.html"],["Privacy","../privacy.html"],["Refunds","../refunds.html"],["Support","../support.html"]].forEach(([label, href], index) => {
      if (index) nav.append(" · ");
      const link = document.createElement("a");
      link.href = href;
      link.textContent = label;
      nav.append(link);
    });
    footer.append(nav);
    const email = document.createElement("a"); email.href = "mailto:localfiletools.support@gmail.com"; email.textContent = "localfiletools.support@gmail.com"; footer.append(email);
  }
  function sanitizePlusMessaging() {
    if (product === "pixelport") {
      document.querySelectorAll("#plus-plan").forEach(card => {
        const description = card.querySelector(".muted"), list = card.querySelector("ul"), button = card.querySelector("[data-checkout]");
        if (description) description.textContent = "Batch conversion, reusable presets, controlled filenames, custom backgrounds, and web-size optimization.";
        if (list) { list.replaceChildren(...["Everything in Standard", "Batch image queue", "Reusable presets", "Background, filename, and optimization controls"].map(text => { const item = document.createElement("li"); item.textContent = text; return item; })); }
        if (button) button.textContent = "Get PixelPort Plus";
      });
      document.querySelectorAll(".compare tr").forEach(row => {
        const label = row.querySelector("th")?.textContent || "";
        if (/Local processing|Core conversion and export|Reusable presets|Advanced workflow tools/.test(label)) { const cells = row.querySelectorAll("td"); if (cells[1]) cells[1].textContent = "Yes"; if (cells[2]) cells[2].textContent = "Yes"; }
      });
      document.querySelectorAll(".faq details").forEach(detail => { if (detail.querySelector("summary")?.textContent.includes("subscription")) { const answer = detail.querySelector("p"); if (answer) answer.textContent = "No. It is a one-time license with no recurring subscription or automatic renewal. PixelPort Plus includes batch conversion, reusable presets, background and filename controls, and web optimization."; } });
      return;
    }
    document.querySelectorAll("#plus-plan").forEach(card => {
      const badge = card.querySelector(".badge");
      const description = card.querySelector(".muted");
      const list = card.querySelector("ul");
      const button = card.querySelector("[data-checkout]");
      if (badge) badge.textContent = "Most Popular";
      if (description) description.textContent = "Plus includes batch conversion, presets, filename controls, custom backgrounds, and web optimization.";
      if (list) list.innerHTML = "<li>Everything in Standard</li><li>Batch image queue and reusable presets</li><li>Background, filename, and web optimization controls</li>";
      if (button) button.textContent = "View Plus";
    });
    document.querySelectorAll(".compare tr").forEach(row => {
      const label = row.querySelector("th")?.textContent || "";
      if (/Reusable presets|Advanced workflow tools/.test(label)) {
        const cells = row.querySelectorAll("td");
        if (cells[1]) cells[1].textContent = "Yes";
        if (cells[2]) cells[2].textContent = "Yes";
      }
    });
    document.querySelectorAll(".faq details").forEach(detail => {
      if (detail.querySelector("summary")?.textContent.includes("subscription")) {
        const answer = detail.querySelector("p");
        if (answer) answer.textContent = "No. It is a one-time license with no recurring subscription or automatic renewal. PixelPort Plus includes batch conversion, reusable presets, background and filename controls, and web optimization.";
      }
    });
  }
  function applyPricing() {
    const prices = window.LOCALFILE_PRICING?.[product];
    const bundle = window.LOCALFILE_PRICING?.bundle;
    if (!prices || !window.formatLocalFilePrice) return;
    const setPrice = (selector, cents) => { const node = document.querySelector(selector); if (node) node.replaceChildren(document.createTextNode(`${window.formatLocalFilePrice(cents)} `), Object.assign(document.createElement("small"), { textContent: "one time" })); };
    setPrice("#standard-plan .price", prices.standard);
    setPrice("#plus-plan .price", prices.plus);
    setPrice("#bundle-offer .price", bundle.plus);
    const plusCard = document.querySelector("#plus-plan");
    if (plusCard) { const note = plusCard.querySelector(".muted"); if (note) note.textContent = product === "pixelport" ? `Upgrade to Plus for only ${window.formatLocalFileDifference(prices.upgrade)} more. Add batch conversion, reusable presets, custom backgrounds, filename rules, and web optimization.` : `Upgrade to Plus for only ${window.formatLocalFileDifference(prices.upgrade)} more. Plus includes the advanced workflow tools described on this page.`; }
    const bundleCard = document.querySelector("#bundle-offer");
    if (bundleCard) { const badge = bundleCard.querySelector(".badge"); if (badge) badge.textContent = "Best Value"; const button = bundleCard.querySelector("[data-checkout]"); if (button) button.textContent = `Get every Plus tool for ${window.formatLocalFilePrice(bundle.plus)}`; const copy = bundleCard.querySelector(".muted"); if (copy) copy.textContent = `Save ${window.formatLocalFilePrice(bundle.savings)} compared with buying separately · Approximately ${bundle.savingsPercent}% off.`; }
    document.querySelectorAll(".dialog [data-checkout]").forEach(button => { const plan = button.dataset.checkout; if (plan === "standard") button.textContent = `Standard · ${window.formatLocalFilePrice(prices.standard)}`; if (plan === "plus") button.textContent = `Plus · ${window.formatLocalFilePrice(prices.plus)}`; if (plan === "bundle") button.textContent = `All five · ${window.formatLocalFilePrice(bundle.plus)}`; });
    document.querySelectorAll(".faq details p").forEach(answer => { if (answer.textContent.includes("$39.99")) answer.textContent = answer.textContent.replaceAll("$39.99", window.formatLocalFilePrice(bundle.plus)); });
  }
  addSiteLinks();
  applyPixelPortLimitsCopy();
  ensurePixelPortTierStatus();
  setTier(tier, tierSource);
  sanitizePlusMessaging();
  applyPricing();
  applyCanonicalProductIcons();
  document.querySelectorAll("[data-checkout]").forEach(b=>b.addEventListener("click",()=>checkoutPlan(b.dataset.checkout)));
  $("closeUpgradeBtn")?.addEventListener("click", closeUpgrade);
  dialog?.addEventListener("click", e=>{ if (e.target===dialog) closeUpgrade(); });
  document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeUpgrade(); });
  window.SuiteGate = { used, markUsed, mayOpenRealDocument, showUpgrade, closeUpgrade, message, update, setActive: v=>{activeRealDocument=!!v;update();}, setPaidAccess: v=>{paidAccess=!!v;update();}, setTier, paid:()=>paidAccess, product };
  window.addEventListener("standard-mode:ready", (event) => { if (event.detail?.product === "pixelport") setTier("standard"); });
  window.addEventListener("plus-mode:ready", (event) => { if (event.detail?.product === "pixelport") setTier("plus", event.detail.source); });
  async function routeLocalPixelPortOwner() {
    if (product !== "pixelport" || mode === "standard" || mode === "plus") return;
    try {
      const capabilities = await import("../license.js");
      const plan = (await capabilities.getCapabilities()).planFor("pixelport");
      if (["standard", "plus"].includes(plan)) location.replace(`./index.html?mode=${plan}`);
    } catch {}
  }
  routeLocalPixelPortOwner();
  update();
  if (mode === "plus" || mode === "standard") { const script = document.createElement("script"); script.src = mode === "plus" ? "../plus-mode.js?v=8f5e2b1" : "../standard-mode.js?v=8f5e2b1"; document.head.append(script); }
  if (product === "pixelport" && mode !== "standard") import("./plus.js").catch(() => {});
})();
