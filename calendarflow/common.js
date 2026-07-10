(() => {
  "use strict";
  const body = document.body;
  const key = body.dataset.demoKey;
  const product = body.dataset.product;
  const checkout = window.PRODUCT_CHECKOUTS || {};
  const PRODUCT_EMBLEMS = Object.freeze({
    ledgerlift: { name: "LedgerLift", src: "../ledgerlift/favicon.svg" },
    pixelport: { name: "PixelPort", src: "../pixelport/favicon.svg" },
    contactcraft: { name: "ContactCraft", src: "../contactcraft/favicon.svg" },
    calendarflow: { name: "CalendarFlow", src: "../calendarflow/favicon.svg" },
    captionshift: { name: "CaptionShift", src: "../captionshift/favicon.svg" }
  });

  function makeProductEmblem(productKey, className = "product-reference-emblem") {
    const definition = PRODUCT_EMBLEMS[productKey];
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

  // Keep one canonical emblem per product everywhere it appears: headers,
  // proof blocks, product menus, related-product cards, and checkout links.
  function applyCanonicalProductEmblems() {
    const own = PRODUCT_EMBLEMS[product];
    const brand = document.querySelector(".brand");
    if (brand && own) {
      let mark = brand.querySelector(".mark");
      if (!mark) {
        mark = document.createElement("span");
        mark.className = "mark";
        brand.prepend(mark);
      }
      const emblem = makeProductEmblem(product, "product-emblem");
      if (emblem) mark.replaceChildren(emblem);
    }

    const proofIcon = document.querySelector(".proof-grid > div:first-child .icon");
    if (proofIcon && own) {
      const emblem = makeProductEmblem(product, "product-emblem");
      if (emblem) proofIcon.replaceChildren(emblem);
    }

    document.querySelectorAll(".product-menu-item").forEach(link => {
      const key = link.dataset.productLink || Object.keys(PRODUCT_EMBLEMS).find(name => {
        const href = link.getAttribute("href") || "";
        return href.includes(`../${name}/`) || href.includes(`/${name}/`);
      });
      if (!key || link.querySelector(".product-reference-emblem")) return;
      const emblem = makeProductEmblem(key);
      if (!emblem) return;
      link.dataset.emblemReady = "true";
      link.prepend(emblem);
    });

    document.querySelectorAll("a.product-card").forEach(link => {
      const href = link.getAttribute("href") || "";
      const key = Object.keys(PRODUCT_EMBLEMS).find(name => href.includes(`../${name}/`) || href.includes(`/${name}/`));
      if (!key || link.querySelector(".product-reference-emblem")) return;
      const emblem = makeProductEmblem(key);
      if (!emblem) return;
      link.dataset.emblemReady = "true";
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
    if (typeof url === "string" && /^https:\/\//i.test(url)) location.assign(url);
    else message(`Secure checkout is not configured yet. Complete the Paddle setup in PAYMENTS_SETUP.md.`);
  }
  function update(sample=false) {
    if (!trial) return;
    if (sample) trial.textContent = "Sample mode does not consume your free document.";
    else if (used() && activeRealDocument) trial.textContent = "Free document active: you may export this open document again. A new document requires a paid license.";
    else if (used()) trial.textContent = "Free document used: choose Standard, Plus, or the five-product bundle to continue.";
    else trial.textContent = "Free demo: convert and export one complete document.";
  }
  applyCanonicalProductEmblems();
  document.querySelectorAll("[data-checkout]").forEach(b=>b.addEventListener("click",()=>checkoutPlan(b.dataset.checkout)));
  $("closeUpgradeBtn")?.addEventListener("click", closeUpgrade);
  dialog?.addEventListener("click", e=>{ if (e.target===dialog) closeUpgrade(); });
  document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeUpgrade(); });
  window.SuiteGate = { used, markUsed, mayOpenRealDocument, showUpgrade, closeUpgrade, message, update, setActive: v=>{activeRealDocument=!!v;update();}, product };
  update();
})();