import { addStoredEntitlement, getInstallationId } from "/license.js";

const message = document.querySelector("#account-message");
const products = document.querySelector("#products");
const names = { ledgerlift: "LedgerLift", pixelport: "PixelPort", contactcraft: "ContactCraft", calendarflow: "CalendarFlow", captionshift: "CaptionShift" };
let account;

function label(value) { return String(value || "").replace(/^./, (character) => character.toUpperCase()); }
function render() {
  const details = document.querySelector("#account-details");
  details.replaceChildren();
  [["Email", account.email], ["Access", "Permanent one-time licenses"]].forEach(([name, value]) => { const row = document.createElement("div"); row.className = "detail"; const labelNode = document.createElement("span"); labelNode.textContent = name; const valueNode = document.createElement("strong"); valueNode.textContent = value; row.append(labelNode, valueNode); details.append(row); });
  products.replaceChildren();
  if (!account.entitlements.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "No purchases are linked to this email yet. If you just completed checkout, wait for the confirmation webhook and try again."; products.append(empty); return; }
  const latest = new Map(); account.entitlements.forEach((item) => { if (!latest.has(item.product_key) || item.plan_key === "plus") latest.set(item.product_key, item); });
  latest.forEach((item) => { const row = document.createElement("div"); row.className = "product"; const copy = document.createElement("div"); const name = document.createElement("strong"); name.textContent = names[item.product_key] || label(item.product_key); const purchase = document.createElement("small"); purchase.textContent = `${label(item.plan_key)} access · Purchased ${new Date(item.created_at).toLocaleDateString()}`; copy.append(name, purchase); const status = document.createElement("strong"); status.textContent = "Active"; row.append(copy, status); products.append(row); });
}
async function restore() {
  const response = await fetch("/api/account/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ installation_id: getInstallationId() }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(result.message || "Could not restore access.");
  result.entitlements.forEach(addStoredEntitlement);
  document.querySelector("#restore-message").textContent = result.entitlements.length ? "Products restored on this device." : "No active products were found for this account.";
}
async function load() {
  const response = await fetch("/api/account/me");
  if (!response.ok) { location.replace("/account/login.html"); return; }
  account = await response.json(); render();
  document.querySelector("#restore-button").addEventListener("click", () => restore().catch((error) => { document.querySelector("#restore-message").textContent = error.message; }));
  document.querySelector("#billing-button").addEventListener("click", async () => { const target = document.querySelector("#billing-message"); target.textContent = "Opening Paddle…"; const result = await fetch("/api/account/portal", { method: "POST" }).then((response) => response.json()); if (result.url) location.assign(result.url); else target.textContent = result.message || "Billing management is not available yet."; });
  await restore().catch((error) => { document.querySelector("#restore-message").textContent = error.message; });
  message.textContent = "Account ready.";
}
load().catch(() => { message.textContent = "We could not load your account. Please sign in again."; });
