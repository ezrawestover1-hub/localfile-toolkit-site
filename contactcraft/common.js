(() => {
  "use strict";
  const body = document.body;
  const key = body.dataset.demoKey;
  const product = body.dataset.product;
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
  let toastTimer;
  const $ = (id) => document.getElementById(id);
  const toast = $("toast");
  const dialog = $("upgradeDialog");
  const trial = $("trialStatus");

  function used() { try { return localStorage.getItem(key) === "used"; } catch { return false; } }
  function markUsed() { try { localStorage.setItem(key, "used"); } catch {} activeRealDocument = true; update(); }
  function mayOpenRealDocument() { return !used() || activeRealDocument; }
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
    if (sample) trial.textContent = "Sample mode does not consume your free document.";
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
    document.querySelectorAll("#plus-plan").forEach(card => {
      const badge = card.querySelector(".badge");
      const description = card.querySelector(".muted");
      const list = card.querySelector("ul");
      const button = card.querySelector("[data-checkout]");
      if (badge) badge.textContent = "Planned release · one-time license";
      if (description) description.textContent = "Plus-specific controls are planned and are not included in the current release.";
      if (list) list.innerHTML = "<li>Everything in Standard</li><li>Future Plus controls — planned</li><li>Not included in the current release</li>";
      if (button) button.textContent = "View Plus";
    });
    document.querySelectorAll(".compare tr").forEach(row => {
      const label = row.querySelector("th")?.textContent || "";
      if (/Reusable presets|Advanced workflow tools/.test(label)) {
        const cells = row.querySelectorAll("td");
        if (cells[1]) cells[1].textContent = "Planned";
        if (cells[2]) cells[2].textContent = "Planned";
      }
    });
    document.querySelectorAll(".faq details").forEach(detail => {
      if (detail.querySelector("summary")?.textContent.includes("subscription")) {
        const answer = detail.querySelector("p");
        if (answer) answer.textContent = "No. It is a one-time license price; Plus-specific controls are planned and are not included in the current release.";
      }
    });
  }
  addSiteLinks();
  sanitizePlusMessaging();
  applyCanonicalProductIcons();
  document.querySelectorAll("[data-checkout]").forEach(b=>b.addEventListener("click",()=>checkoutPlan(b.dataset.checkout)));
  $("closeUpgradeBtn")?.addEventListener("click", closeUpgrade);
  dialog?.addEventListener("click", e=>{ if (e.target===dialog) closeUpgrade(); });
  document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeUpgrade(); });
  window.SuiteGate = { used, markUsed, mayOpenRealDocument, showUpgrade, closeUpgrade, message, update, setActive: v=>{activeRealDocument=!!v;update();}, product };
  update();
})();
