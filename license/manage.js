import { getStoredEntitlements, removeStoredEntitlement, verifyEntitlement } from "/license.js";
const root = document.querySelector("#entitlements");
const message = document.querySelector("#manage-message");
function label(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
async function render() {
  root.replaceChildren();
  const tokens = getStoredEntitlements();
  if (!tokens.length) { root.textContent = "No entitlements are stored in this browser."; return; }
  for (const token of tokens) {
    const result = await verifyEntitlement(token).catch(() => null);
    const card = document.createElement("section"); card.className = "license-card";
    if (result && window.PRODUCT_ICONS) {
      const iconKeys = result.product === "suite" ? Object.keys(window.PRODUCT_ICONS) : [result.product];
      const icons = document.createElement("div"); icons.className = "license-card-icons";
      iconKeys.forEach(key => { const item = window.PRODUCT_ICONS[key]; if (!item) return; const image = document.createElement("img"); image.src = item.icon; image.width = 40; image.height = 40; image.alt = item.name; icons.append(image); });
      card.append(icons);
    }
    const title = document.createElement("h2"); title.textContent = result ? `${label(result.product)} — ${label(result.plan)}` : "Unavailable entitlement";
    const status = document.createElement("p"); status.textContent = result ? "Verified and active" : "Could not verify";
    const button = document.createElement("button"); button.type = "button"; button.textContent = "Remove from this browser"; button.addEventListener("click", () => { removeStoredEntitlement(token); render(); message.textContent = "Removed locally. Remote deactivation is not implemented."; });
    card.append(title, status, button); root.append(card);
  }
}
render();
