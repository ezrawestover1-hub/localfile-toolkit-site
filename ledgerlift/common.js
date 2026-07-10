(() => {
  "use strict";
  const body = document.body;
  const key = body.dataset.demoKey;
  const product = body.dataset.product;
  const checkout = window.PRODUCT_CHECKOUTS || {};
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
  document.querySelectorAll("[data-checkout]").forEach(b=>b.addEventListener("click",()=>checkoutPlan(b.dataset.checkout)));
  $("closeUpgradeBtn")?.addEventListener("click", closeUpgrade);
  dialog?.addEventListener("click", e=>{ if (e.target===dialog) closeUpgrade(); });
  document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeUpgrade(); });
  window.SuiteGate = { used, markUsed, mayOpenRealDocument, showUpgrade, closeUpgrade, message, update, setActive: v=>{activeRealDocument=!!v;update();}, product };
  update();
})();