(() => {
  "use strict";
  const product = document.body.dataset.product;
  const products = {
    ledgerlift: { name: "LedgerLift", description: "Advanced CSV-to-IIF workflows with reusable profiles, categorization, duplicate review, and reports." },
    pixelport: { name: "PixelPort", description: "Batch image conversion with reusable presets, controlled filenames, custom backgrounds, and web optimization." },
    contactcraft: { name: "ContactCraft", description: "Duplicate review, merge tools, field cleanup, output mapping, and validation reporting for contact files." },
    calendarflow: { name: "CalendarFlow", description: "Calendar merging, filtering, recurrence normalization, saved presets, and validation reporting." },
    captionshift: { name: "CaptionShift", description: "Batch subtitle conversion with timing presets, cleanup tools, and validation reporting." }
  };
  const params = new URLSearchParams(location.search);
  if (!products[product] || params.get("mode") !== "plus") return;

  const meta = products[product];
  const plusPath = `/${product}/index.html?mode=plus`;
  const standardPath = `/${product}/index.html?mode=standard`;
  document.body.classList.add("plus-mode");
  document.body.dataset.plusRoute = "true";
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "../plus-mode.css?v=8f5e2b1";
  stylesheet.dataset.plusModeStyles = "true";
  document.head.append(stylesheet);

  function link(label, href, className = "button") {
    const anchor = document.createElement("a");
    anchor.className = className;
    anchor.href = href;
    anchor.textContent = label;
    return anchor;
  }

  function addHandoff() {
    if (document.querySelector("#plus-handoff")) return;
    const handoff = document.createElement("section");
    handoff.id = "plus-handoff";
    handoff.className = "plus-handoff container";
    const copy = document.createElement("div");
    copy.className = "plus-handoff-copy";
    const label = document.createElement("span");
    label.className = "plus-handoff-label";
    label.textContent = "PLUS WORKSPACE";
    const heading = document.createElement("h1");
    heading.textContent = `${meta.name} Plus`;
    const description = document.createElement("p");
    description.textContent = meta.description;
    copy.append(label, heading, description);
    const actions = document.createElement("div");
    actions.className = "plus-handoff-actions";
    actions.append(link("My Account", "/account/"), link("Access other products", "/account/", "button secondary"), link("Standard view", standardPath, "plus-text-link"));
    handoff.append(copy, actions);
    document.querySelector("main")?.prepend(handoff);
  }

  function addGate(state = "loading") {
    let gate = document.querySelector("#plus-access-gate");
    if (!gate) {
      gate = document.createElement("section");
      gate.id = "plus-access-gate";
      gate.className = "plus-access-gate container";
      document.querySelector("main")?.prepend(gate);
    }
    gate.dataset.state = state;
    const icon = document.createElement("img");
    icon.src = `../assets/product-icons/${product}/icon-128.png`;
    icon.alt = "";
    icon.width = 72;
    icon.height = 72;
    const heading = document.createElement("h1");
    heading.textContent = state === "loading" ? `Checking your ${meta.name} Plus access…` : state === "not-entitled" ? `${meta.name} Plus is not connected to this account.` : `${meta.name} Plus is ready when you are.`;
    const copy = document.createElement("p");
    copy.textContent = state === "loading" ? "Checking your account and restoring this device’s license." : state === "unauthenticated" ? "Sign in with the account used for your purchase to restore Plus access on this device." : state === "not-entitled" ? "This account is signed in, but it does not have this product’s Plus entitlement. Open your account to review connected products or purchase Plus." : "Your account is signed in, but this device has not received a Plus activation yet. Try restoring again or open My Account.";
    const actions = document.createElement("div");
    actions.className = "plus-gate-actions";
    if (state === "unauthenticated") {
      const login = new URL("/account/login.html", location.origin);
      login.searchParams.set("next", plusPath);
      actions.append(link("Sign in and restore Plus", login.pathname + login.search, "button"));
    } else if (state !== "loading") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "button";
      retry.textContent = "Retry Plus restore";
      retry.addEventListener("click", resolveAccess, { once: true });
      actions.append(retry, link("Open My Account", "/account/", "button secondary"));
    }
    if (state !== "loading") actions.append(link(`Get ${meta.name} Plus`, `/checkout-portal/index.html?product=${product}&plan=plus`, "button secondary"), link("Standard workspace", standardPath, "plus-text-link"));
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
    if (privacy) privacy.textContent = "PLUS WORKSPACE · LOCAL PROCESSING";
    if (heading) heading.textContent = `Start your ${meta.name} Plus workflow`;
    if (copy) copy.textContent = "Upload a real file to use the premium controls below. Your file stays in this browser.";
    if (trial) { trial.textContent = "Plus access is active. Real files are available without the free-document limit."; trial.classList.add("plus-active-status"); }
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

  async function getPlusState() {
    const license = await import("../license.js");
    let capabilities = await license.getCapabilities();
    if (capabilities.canUsePlus(product)) return { state: "authorized" };
    const accountResponse = await fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
    const account = await accountResponse?.json().catch(() => ({}));
    if (!accountResponse) return { state: "restore-error" };
    if (accountResponse.status === 401 || !account?.authenticated) return { state: "unauthenticated" };
    if (!accountResponse.ok) return { state: "restore-error" };
    const restored = await license.restoreEntitlements();
    capabilities = await license.getCapabilities();
    if (capabilities.canUsePlus(product)) return { state: "authorized" };
    if (!restored.ok) return { state: "restore-error" };
    const hasBundle = account.bundle === true || (account.entitlements || []).some((item) => item.product_key === "suite" && item.plan_key === "bundle");
    const hasPlus = hasBundle || (account.entitlements || []).some((item) => item.product_key === product && item.plan_key === "plus");
    return { state: hasPlus ? "restore-error" : "not-entitled" };
  }

  function markAuthorized() {
    document.querySelector("#plus-access-gate")?.remove();
    document.body.classList.add("plus-authorized");
    document.body.classList.remove("plus-locked");
    document.body.dataset.plusAccessState = "authorized";
    document.title = `${meta.name} Plus — LocalFile Tools`;
    addHandoff();
    prepareCore();
    window.dispatchEvent(new CustomEvent("plus-mode:ready", { detail: { product } }));
  }

  function markLocked(state) {
    document.body.classList.add("plus-locked");
    document.body.classList.remove("plus-authorized");
    document.body.dataset.plusAccessState = state;
    window.SuiteGate?.setPaidAccess(false);
    document.title = `${meta.name} Plus — LocalFile Tools`;
    addGate(state);
  }

  async function resolveAccess() {
    addGate("loading");
    try {
      await waitForSuiteGate();
      const result = await getPlusState();
      if (result.state === "authorized") markAuthorized();
      else markLocked(result.state);
    } catch {
      markLocked("restore-error");
    }
  }

  resolveAccess();
})();
