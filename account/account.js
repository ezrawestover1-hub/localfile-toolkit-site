import { restoreEntitlements } from "/license.js";

const message = document.querySelector("#account-message");
const productsRoot = document.querySelector("#products");
const productMeta = {
  ledgerlift: { name: "LedgerLift", feature: "Private CSV-to-IIF conversion with Plus profiles, categorization, duplicate review, and reports.", home: "/ledgerlift/index.html" },
  pixelport: { name: "PixelPort", feature: "Private image conversion, batch processing, and Plus export controls.", home: "/pixelport/index.html" },
  contactcraft: { name: "ContactCraft", feature: "Clean contact conversion with Plus normalization and export tools.", home: "/contactcraft/index.html" },
  calendarflow: { name: "CalendarFlow", feature: "Calendar conversion with Plus batch workflows and flexible export controls.", home: "/calendarflow/index.html" },
  captionshift: { name: "CaptionShift", feature: "Subtitle conversion with Plus batch processing and format workflows.", home: "/captionshift/index.html" }
};
const planRank = { standard: 1, plus: 2 };
let account;

function currentEntitlements() {
  const latest = new Map();
  const active = Array.isArray(account?.entitlements) ? account.entitlements.filter((item) => item?.status === undefined || item.status === "active") : [];
  latest.bundleActive = account?.bundle === true || active.some((item) => item.product_key === "suite" && item.plan_key === "bundle");
  latest.hasPurchase = latest.bundleActive;
  active.forEach((item) => {
    if (!productMeta[item.product_key] || !planRank[item.plan_key]) return;
    const previous = latest.get(item.product_key);
    if (!previous || planRank[item.plan_key] > planRank[previous.plan_key]) latest.set(item.product_key, item);
    latest.hasPurchase = true;
  });
  return latest;
}

function makeText(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function makeLink(label, href, className = "button") {
  const link = document.createElement("a");
  link.className = className;
  link.href = href;
  link.textContent = label;
  return link;
}

function renderSummary(entitlements) {
  let summary = document.querySelector("#account-summary");
  if (!summary) {
    summary = document.createElement("section");
    summary.id = "account-summary";
    summary.className = "account-summary";
    document.querySelector(".account-grid")?.before(summary);
  }
  const count = entitlements.bundleActive ? Object.keys(productMeta).length : entitlements.size;
  const plusCount = entitlements.bundleActive ? count : [...entitlements.values()].filter((item) => item.plan_key === "plus").length;
  const status = entitlements.bundleActive ? "Complete Plus bundle active" : count === Object.keys(productMeta).length && plusCount === count ? "Plus access active across your toolkit" : plusCount ? "Your Plus upgrades are ready" : "Standard access active";
  summary.replaceChildren();
  const main = document.createElement("div");
  main.className = "account-summary-main";
  main.append(makeText("span", "eyebrow", "LOCALFILE TOOLKIT ACCOUNT"), makeText("h2", "", status), makeText("p", "", "Your one-time licenses stay connected to this account across devices. Open a product below whenever you are ready to work."));
  const countNode = document.createElement("div");
  countNode.className = "account-summary-count";
  countNode.append(makeText("strong", "", String(count)), makeText("span", "", count === 1 ? "product ready" : "products ready"));
  summary.append(main, countNode);
}

function renderDetails() {
  const details = document.querySelector("#account-details");
  details.replaceChildren();
  [["Email", account.email], ["Access", "Permanent one-time licenses"], ["Products", `${currentEntitlements().size} of ${Object.keys(productMeta).length} connected`]].forEach(([name, value]) => {
    const row = document.createElement("div");
    row.className = "detail";
    row.append(makeText("span", "", name), makeText("strong", "", value));
    details.append(row);
  });
}

function renderProductCard(key, entitlement) {
  const meta = productMeta[key];
  const plan = entitlement?.plan_key || "unowned";
  const included = entitlement?.source === "bundle";
  const plus = plan === "plus";
  const standard = plan === "standard";
  const card = document.createElement("article");
  card.className = `product-card ${plus ? "is-plus" : standard ? "is-standard" : "is-unowned"}`;
  const header = document.createElement("div");
  header.className = "account-product-header";
  const icon = document.createElement("img");
  icon.className = "account-product-icon";
  icon.src = `/assets/product-icons/${key}/icon-64.png`;
  icon.alt = "";
  icon.width = 48;
  icon.height = 48;
  const copy = document.createElement("div");
  copy.className = "account-product-copy";
  copy.append(makeText("h3", "", meta.name), makeText("span", "account-product-meta", included ? "Included with Bundle" : plus ? "Plus unlocked" : standard ? "Standard active" : "Not purchased"));
  header.append(icon, copy);
  const status = makeText("span", `account-product-status ${included ? "bundle" : plan}`, included ? "INCLUDED WITH BUNDLE" : plus ? "PLUS" : standard ? "STANDARD" : "EXPLORE");
  header.append(status);
  const description = makeText("p", "", plus || standard ? meta.feature : `Explore ${meta.name} and see which workflow fits your files.`);
  const actions = document.createElement("div");
  actions.className = "product-actions";
  if (plus) {
    actions.append(makeLink(`Open ${meta.name} Plus`, `${meta.home}?mode=plus`), makeLink("Access other products", "/account/", "button secondary"));
  } else if (standard) {
    actions.append(makeLink(`Open ${meta.name} Standard`, `${meta.home}?mode=standard`), makeLink("Upgrade to Plus", `/checkout-portal/index.html?product=${key}&plan=plus`, "button secondary"));
  } else {
    actions.append(makeLink(`Explore ${meta.name}`, meta.home), makeLink("View pricing", `/pricing.html#${key}`, "button secondary"));
  }
  card.append(header, description, actions);
  return card;
}

function renderProducts(entitlements) {
  productsRoot.replaceChildren();
  Object.keys(productMeta).forEach((key) => productsRoot.append(renderProductCard(key, entitlements.bundleActive ? { plan_key: "plus", source: "bundle" } : entitlements.get(key))));
}

function setupTabs() {
  if (document.querySelector(".account-tabs")) return;
  const grid = document.querySelector(".account-grid");
  const productPanel = grid?.nextElementSibling;
  if (!grid || !productPanel) return;
  const overviewPanel = grid.children[0];
  const billingPanel = grid.children[1];
  const panels = [overviewPanel, billingPanel, productPanel];
  panels.forEach((panel, index) => {
    if (panel) {
      panel.dataset.accountPanel = index === 0 ? "overview" : index === 1 ? "billing" : "products";
      panel.id = `account-panel-${panel.dataset.accountPanel}`;
      panel.setAttribute("role", "tabpanel");
    }
  });
  const securityPanel = document.createElement("section");
  securityPanel.className = "panel security-panel";
  securityPanel.dataset.accountPanel = "security";
  securityPanel.id = "account-panel-security";
  securityPanel.setAttribute("role", "tabpanel");
  securityPanel.append(makeText("h2", "", "Security"), makeText("p", "", "Keep your account protected with a unique password. Password recovery is available whenever you need it."), makeLink("Change or reset password", "/account/reset.html", "button secondary"), makeText("p", "", ""), makeLink("Sign out", "/api/account/logout", "button secondary"));
  productPanel.after(securityPanel);
  const tabs = document.createElement("div");
  tabs.className = "account-tabs";
  tabs.setAttribute("role", "tablist");
  const labels = [["overview", "Overview"], ["products", "Products"], ["billing", "Billing"], ["security", "Security"]];
  const activate = (selected) => {
    panels.concat(securityPanel).forEach((panel) => { if (panel) panel.hidden = panel.dataset.accountPanel !== selected; });
    tabs.querySelectorAll("[role=tab]").forEach((tab) => tab.setAttribute("aria-selected", tab.dataset.tab === selected ? "true" : "false"));
  };
  labels.forEach(([key, label], index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "account-tab";
    tab.dataset.tab = key;
    tab.id = `account-tab-${key}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `account-panel-${key}`);
    tab.setAttribute("aria-selected", index === 0 ? "true" : "false");
    document.querySelector(`#account-panel-${key}`)?.setAttribute("aria-labelledby", tab.id);
    tab.textContent = label;
    tab.addEventListener("click", () => activate(key));
    tabs.append(tab);
  });
  grid.before(tabs);
  activate("overview");
}

async function restore() {
  const button = document.querySelector("#restore-button");
  if (button) { button.disabled = true; button.textContent = "Restoring access…"; }
  try {
    const result = await restoreEntitlements();
    if (!result.ok) throw Error(result.result?.message || "Could not restore access.");
    document.querySelector("#restore-message").textContent = result.tokens?.length ? "Products restored on this device." : "No active products were found for this account.";
  } finally {
    if (button) { button.disabled = false; button.textContent = "Restore products on this device"; }
  }
}

async function load() {
  const response = await fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) { location.replace("/account/login.html"); return; }
  account = await response.json();
  const entitlements = currentEntitlements();
  setupTabs();
  renderSummary(entitlements);
  renderDetails();
  renderProducts(entitlements);
  document.querySelector("#restore-button").addEventListener("click", () => restore().catch((error) => { document.querySelector("#restore-message").textContent = error.message; }));
  document.querySelector("#billing-button").addEventListener("click", async () => { const target = document.querySelector("#billing-message"); target.textContent = "Opening Paddle…"; const result = await fetch("/api/account/portal", { method: "POST" }).then((item) => item.json()).catch(() => ({})); if (result.url) location.assign(result.url); else target.textContent = result.message || "Billing management is not available yet."; });
  await restore().catch((error) => { document.querySelector("#restore-message").textContent = error.message; });
  message.textContent = "Account ready.";
}

load().catch(() => { message.textContent = "We could not load your account. Please sign in again."; });
