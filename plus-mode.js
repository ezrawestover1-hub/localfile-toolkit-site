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
  const standardPath = `/${product}/index.html`;
  document.body.classList.add("plus-mode");
  document.body.dataset.plusRoute = "true";
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "../plus-mode.css";
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

  function addGate() {
    if (document.querySelector("#plus-access-gate")) return;
    const gate = document.createElement("section");
    gate.id = "plus-access-gate";
    gate.className = "plus-access-gate container";
    const icon = document.createElement("img");
    icon.src = `../assets/product-icons/${product}/icon-128.png`;
    icon.alt = "";
    icon.width = 72;
    icon.height = 72;
    const heading = document.createElement("h1");
    heading.textContent = `${meta.name} Plus is ready when you are.`;
    const copy = document.createElement("p");
    copy.textContent = "This direct Plus workspace requires a verified Plus entitlement. Sign in to restore access on this device, or complete the one-time Plus purchase.";
    const actions = document.createElement("div");
    actions.className = "plus-gate-actions";
    const login = new URL("/account/login.html", location.origin);
    login.searchParams.set("next", plusPath);
    actions.append(link("Sign in and restore Plus", login.pathname + login.search, "button"), link(`Get ${meta.name} Plus`, `/checkout-portal/index.html?product=${product}&plan=plus`, "button secondary"), link("Return to Standard", standardPath, "plus-text-link"));
    gate.append(icon, heading, copy, actions);
    document.querySelector("main")?.prepend(gate);
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
    document.querySelector("#work")?.classList.remove("hidden");
  }

  async function getPlusCapabilities() {
    const license = await import("../license.js");
    let capabilities = await license.getCapabilities();
    if (capabilities.canUsePlus(product)) return capabilities;
    const response = await fetch("/api/account/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ installation_id: license.getInstallationId() }), credentials: "same-origin" }).catch(() => null);
    if (response?.ok) {
      const result = await response.json().catch(() => ({}));
      (result.entitlements || []).forEach(license.addStoredEntitlement);
      capabilities = await license.getCapabilities();
    }
    return capabilities;
  }

  function markAuthorized() {
    document.body.classList.add("plus-authorized");
    document.body.classList.remove("plus-locked");
    document.title = `${meta.name} Plus — LocalFile Tools`;
    addHandoff();
    prepareCore();
    window.dispatchEvent(new CustomEvent("plus-mode:ready", { detail: { product } }));
  }

  function markLocked() {
    document.body.classList.add("plus-locked");
    document.body.classList.remove("plus-authorized");
    document.title = `${meta.name} Plus — LocalFile Tools`;
    addGate();
  }

  addGate();
  getPlusCapabilities().then((capabilities) => {
    if (capabilities.canUsePlus(product)) markAuthorized();
    else markLocked();
  }).catch(() => markLocked());
})();
