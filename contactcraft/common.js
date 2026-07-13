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
  let toastTimer;
  const $ = (id) => document.getElementById(id);
  const toast = $("toast");
  const dialog = $("upgradeDialog");
  const trial = $("trialStatus");

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
    if (paidAccess) trial.textContent = mode === "plus" ? "Plus access is active. Real files are available without the free-document limit." : "Standard access is active. Core conversions are available without the free-document limit.";
    else if (sample) trial.textContent = "Sample mode does not consume your free document.";
    else if (used() && activeRealDocument) trial.textContent = "Free document active: you may export this open document again. A new document requires a paid license.";
    else if (used()) trial.textContent = "Free document used: choose Standard, Plus, or the five-product bundle to continue.";
    else trial.textContent = "Free demo: convert and export one complete document.";
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
    if (product === "contactcraft") {
      document.querySelectorAll("#plus-plan").forEach(card => {
        const description = card.querySelector(".muted"), list = card.querySelector("ul"), button = card.querySelector("[data-checkout]");
        if (description) description.textContent = "Duplicate detection, merge review, field cleanup, output mapping, and validation reports.";
        if (list) { list.replaceChildren(...["Everything in Standard", "Duplicate detection and merge review", "Field cleanup and output mapping", "Validation reports"].map(text => { const item = document.createElement("li"); item.textContent = text; return item; })); }
        if (button) button.textContent = "Get ContactCraft Plus";
      });
      document.querySelectorAll(".compare tr").forEach(row => { const label = row.querySelector("th")?.textContent || ""; if (/Local processing|Core conversion and export|Reusable presets|Advanced workflow tools/.test(label)) { const cells = row.querySelectorAll("td"); if (cells[1]) cells[1].textContent = "Yes"; if (cells[2]) cells[2].textContent = "Yes"; } });
      document.querySelectorAll(".faq details").forEach(detail => { if (detail.querySelector("summary")?.textContent.includes("subscription")) { const answer = detail.querySelector("p"); if (answer) answer.textContent = "No. It is a one-time license with no recurring subscription or automatic renewal. ContactCraft Plus includes duplicate review, merging, cleanup, output mapping, and validation reports."; } });
      return;
    }
    document.querySelectorAll("#plus-plan").forEach(card => {
      const badge = card.querySelector(".badge");
      const description = card.querySelector(".muted");
      const list = card.querySelector("ul");
      const button = card.querySelector("[data-checkout]");
      if (badge) badge.textContent = "Most Popular";
      if (description) description.textContent = "Plus includes duplicate review, cleanup, output mapping, merging, and validation reports.";
      if (list) list.innerHTML = "<li>Everything in Standard</li><li>Duplicate detection and merge review</li><li>Field cleanup, output mapping, and validation reports</li>";
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
        if (answer) answer.textContent = "No. It is a one-time license with no recurring subscription or automatic renewal. ContactCraft Plus includes duplicate review, merging, cleanup, output mapping, and validation reports.";
      }
    });
  }
  function applyPricing() {
    const prices = window.LOCALFILE_PRICING?.[product]; const bundle = window.LOCALFILE_PRICING?.bundle;
    if (!prices || !window.formatLocalFilePrice) return;
    const setPrice = (selector, cents) => { const node = document.querySelector(selector); if (node) node.replaceChildren(document.createTextNode(`${window.formatLocalFilePrice(cents)} `), Object.assign(document.createElement("small"), { textContent: "one time" })); };
    setPrice("#standard-plan .price", prices.standard); setPrice("#plus-plan .price", prices.plus); setPrice("#bundle-offer .price", bundle.plus);
    const plusCard = document.querySelector("#plus-plan"); if (plusCard?.querySelector(".muted")) plusCard.querySelector(".muted").textContent = product === "contactcraft" ? `Upgrade to Plus for only ${window.formatLocalFileDifference(prices.upgrade)} more. Add duplicate review, cleanup, mapping, merging, and validation reports.` : `Upgrade to Plus for only ${window.formatLocalFileDifference(prices.upgrade)} more. Plus includes the advanced workflow tools described on this page.`;
    const bundleCard = document.querySelector("#bundle-offer"); if (bundleCard) { bundleCard.querySelector(".badge")?.replaceChildren("Best Value"); const button = bundleCard.querySelector("[data-checkout]"); if (button) button.textContent = `Get every Plus tool for ${window.formatLocalFilePrice(bundle.plus)}`; const copy = bundleCard.querySelector(".muted"); if (copy) copy.textContent = `Save ${window.formatLocalFilePrice(bundle.savings)} compared with buying separately · Approximately ${bundle.savingsPercent}% off.`; }
    document.querySelectorAll(".dialog [data-checkout]").forEach(button => { const plan = button.dataset.checkout; if (plan === "standard") button.textContent = `Standard · ${window.formatLocalFilePrice(prices.standard)}`; if (plan === "plus") button.textContent = `Plus · ${window.formatLocalFilePrice(prices.plus)}`; if (plan === "bundle") button.textContent = `All five · ${window.formatLocalFilePrice(bundle.plus)}`; });
    document.querySelectorAll(".faq details p").forEach(answer => { if (answer.textContent.includes("$39.99")) answer.textContent = answer.textContent.replaceAll("$39.99", window.formatLocalFilePrice(bundle.plus)); });
  }
  addSiteLinks();
  sanitizePlusMessaging();
  applyPricing();
  applyCanonicalProductIcons();
  document.querySelectorAll("[data-checkout]").forEach(b=>b.addEventListener("click",()=>checkoutPlan(b.dataset.checkout)));
  $("closeUpgradeBtn")?.addEventListener("click", closeUpgrade);
  dialog?.addEventListener("click", e=>{ if (e.target===dialog) closeUpgrade(); });
  document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeUpgrade(); });
  window.SuiteGate = { used, markUsed, mayOpenRealDocument, showUpgrade, closeUpgrade, message, update, setActive: v=>{activeRealDocument=!!v;update();}, setPaidAccess: v=>{paidAccess=!!v;update();}, paid:()=>paidAccess, product };
  update();
  if (mode === "plus" || mode === "standard") { const script = document.createElement("script"); script.src = mode === "plus" ? "../plus-mode.js?v=8f5e2b1" : "../standard-mode.js?v=8f5e2b1"; document.head.append(script); }
  if (product === "contactcraft" && mode !== "standard") import("./plus.js").catch(() => {});
})();
