(() => {
  "use strict";
  const product = document.body.dataset.product;
  const products = {
    ledgerlift: { name: "LedgerLift", description: "Unlimited core CSV-to-IIF conversion with mapping, preview, validation, and export." },
    pixelport: { name: "PixelPort", description: "Unlimited core image conversion with preview, resizing, quality, and supported background controls." },
    contactcraft: { name: "ContactCraft", description: "Unlimited core contact conversion with preview, cleanup, and export." },
    calendarflow: { name: "CalendarFlow", description: "Unlimited core calendar conversion with preview, validation, and export." },
    captionshift: { name: "CaptionShift", description: "Unlimited core subtitle conversion with timing preview and export." }
  };
  const params = new URLSearchParams(location.search);
  if (!products[product] || params.get("mode") !== "standard") return;

  const meta = products[product];
  const standardPath = `/${product}/index.html?mode=standard`;
  const plusPath = `/${product}/index.html?mode=plus`;
  document.body.classList.add("standard-mode");
  document.body.dataset.standardRoute = "true";
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "../standard-mode.css?v=8f5e2b1";
  stylesheet.dataset.standardModeStyles = "true";
  document.head.append(stylesheet);

  function link(label, href, className = "button") {
    const anchor = document.createElement("a");
    anchor.className = className;
    anchor.href = href;
    anchor.textContent = label;
    return anchor;
  }

  function addHandoff() {
    if (document.querySelector("#standard-handoff")) return;
    const handoff = document.createElement("section");
    handoff.id = "standard-handoff";
    handoff.className = "standard-handoff container";
    const copy = document.createElement("div");
    copy.className = "standard-handoff-copy";
    const label = document.createElement("span");
    label.className = "standard-handoff-label";
    label.textContent = "STANDARD WORKSPACE";
    const heading = document.createElement("h1");
    heading.textContent = `${meta.name} Standard`;
    const description = document.createElement("p");
    description.textContent = meta.description;
    copy.append(label, heading, description);
    const actions = document.createElement("div");
    actions.className = "standard-handoff-actions";
    actions.append(link("My Account", "/account/"), link(`Upgrade to ${meta.name} Plus`, plusPath, "button secondary"));
    handoff.append(copy, actions);
    document.querySelector("main")?.prepend(handoff);
  }

  function addGate(state = "loading") {
    let gate = document.querySelector("#standard-access-gate");
    if (!gate) {
      gate = document.createElement("section");
      gate.id = "standard-access-gate";
      gate.className = "standard-access-gate container";
      document.querySelector("main")?.prepend(gate);
    }
    const icon = document.createElement("img");
    icon.src = `../assets/product-icons/${product}/icon-128.png`;
    icon.alt = "";
    icon.width = 72;
    icon.height = 72;
    const heading = document.createElement("h1");
    heading.textContent = state === "loading" ? `Checking your ${meta.name} Standard access…` : `${meta.name} Standard is ready when you are.`;
    const copy = document.createElement("p");
    copy.textContent = state === "loading" ? "Checking your account and restoring this device’s license." : state === "unauthenticated" ? "Sign in with the account used for your purchase to restore Standard access on this device." : state === "not-entitled" ? "This account does not have a Standard entitlement for this product. Complete the one-time Standard purchase to unlock unlimited core conversion." : "Your account is signed in, but this device has not received its Standard activation yet. Try restoring again or open My Account.";
    const actions = document.createElement("div");
    actions.className = "standard-gate-actions";
    if (state === "unauthenticated") {
      const login = new URL("/account/login.html", location.origin);
      login.searchParams.set("next", standardPath);
      actions.append(link("Sign in and restore Standard", login.pathname + login.search, "button"));
    } else if (state !== "loading") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "button";
      retry.textContent = "Retry Standard restore";
      retry.addEventListener("click", resolveAccess, { once: true });
      actions.append(retry, link("Open My Account", "/account/", "button secondary"));
    }
    if (state !== "loading") actions.append(link(`Get ${meta.name} Standard`, `/checkout-portal/index.html?product=${product}&plan=standard`, "button secondary"), link("Return to free view", `/${product}/index.html`, "standard-text-link"));
    gate.replaceChildren(icon, heading, copy, actions);
  }

  function prepareCore() {
    const converter = document.querySelector("#converter");
    if (!converter) return;
    const privacy = converter.querySelector(".privacy-line");
    const heading = converter.querySelector(".section-title h2");
    const copy = converter.querySelector(".section-title p");
    const trial = document.querySelector("#trialStatus");
    const sample = document.querySelector("#sampleBtn");
    if (privacy) privacy.textContent = "STANDARD WORKSPACE · LOCAL PROCESSING";
    if (heading) heading.textContent = `Start your ${meta.name} Standard workflow`;
    if (copy) copy.textContent = "Upload a real file for unlimited core conversion. Your file stays in this browser.";
    if (trial) { trial.textContent = "Standard access is active. Core conversions are available without the free-document limit."; trial.classList.add("standard-active-status"); }
    if (sample) sample.hidden = true;
    window.SuiteGate?.setPaidAccess(true);
    document.querySelector("#work")?.classList.remove("hidden");
  }

  function waitForSuiteGate() {
    if (window.SuiteGate) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        if (window.SuiteGate) return resolve();
        if (Date.now() - started >= 5000) return reject(new Error("workspace_not_ready"));
        setTimeout(check, 25);
      };
      check();
    });
  }

  async function getAccessState() {
    const license = await import("../license.js");
    let capabilities = await license.getCapabilities();
    if (capabilities.canUseCore(product)) return "authorized";
    const accountResponse = await fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
    const account = await accountResponse?.json().catch(() => ({}));
    if (!accountResponse) return "restore-error";
    if (accountResponse.status === 401 || !account?.authenticated) return "unauthenticated";
    if (!accountResponse.ok) return "restore-error";
    const restored = await license.restoreEntitlements();
    capabilities = await license.getCapabilities();
    if (capabilities.canUseCore(product)) return "authorized";
    if (!restored.ok) return "restore-error";
    const hasBundle = account.bundle === true || (account.entitlements || []).some((item) => item.product_key === "suite" && item.plan_key === "bundle");
    return hasBundle || (account.entitlements || []).some((item) => item.product_key === product && ["standard", "plus"].includes(item.plan_key)) ? "restore-error" : "not-entitled";
  }

  function markAuthorized() {
    document.querySelector("#standard-access-gate")?.remove();
    document.body.classList.add("standard-authorized");
    document.body.classList.remove("standard-locked");
    document.body.dataset.standardAccessState = "authorized";
    document.title = `${meta.name} Standard — LocalFile Tools`;
    addHandoff();
    prepareCore();
    window.dispatchEvent(new CustomEvent("standard-mode:ready", { detail: { product } }));
  }

  function markLocked(state) {
    document.body.classList.add("standard-locked");
    document.body.classList.remove("standard-authorized");
    document.body.dataset.standardAccessState = state;
    window.SuiteGate?.setPaidAccess(false);
    document.title = `${meta.name} Standard — LocalFile Tools`;
    addGate(state);
  }

  async function resolveAccess() {
    addGate("loading");
    try {
      await waitForSuiteGate();
      const state = await getAccessState();
      if (state === "authorized") markAuthorized();
      else markLocked(state);
    } catch {
      markLocked("restore-error");
    }
  }

  resolveAccess();
})();
